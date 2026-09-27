/**
 * activityController.js — order-linked schedules & follow-ups
 * (callback, repair appointment, follow-up, pickup/delivery, post-repair follow-up)
 *
 * Available to owner and telecaller roles. Carries no pricing data, so no
 * role-based redaction is needed here (unlike orderController).
 */

const pool = require('../config/database');

const ACTIVITY_TYPES = ['callback', 'repair_appointment', 'follow_up', 'pickup_delivery', 'post_repair_follow_up'];
const ACTIVITY_STATUSES = ['pending', 'done', 'cancelled'];

const resolveOrderDbId = async (client, orderIdOrDbId) => {
  const { rows } = await client.query(
    'SELECT id FROM repair_orders WHERE id::text = $1 OR order_id = $1',
    [String(orderIdOrDbId)]
  );
  return rows.length ? rows[0].id : null;
};

// POST /api/activities
const createActivity = async (req, res, next) => {
  try {
    const { order_id, type, scheduled_at, notes, assigned_to_id } = req.body;

    if (!ACTIVITY_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${ACTIVITY_TYPES.join(', ')}` });
    }
    if (!scheduled_at) {
      return res.status(400).json({ success: false, message: 'scheduled_at is required' });
    }

    const dbOrderId = await resolveOrderDbId(pool, order_id);
    if (!dbOrderId) return res.status(404).json({ success: false, message: 'Order not found' });

    let assignedId = null;
    if (assigned_to_id) {
      const { rows } = await pool.query(
        `SELECT id FROM admins WHERE id = $1 AND is_active = true AND role IN ('admin','super_admin','telecaller')`,
        [assigned_to_id]
      );
      if (!rows.length) return res.status(400).json({ success: false, message: 'Invalid assigned_to_id' });
      assignedId = rows[0].id;
    }

    const { id: userId, name: userName } = req.user;

    const { rows: [activity] } = await pool.query(
      `INSERT INTO order_activities
        (order_id, type, scheduled_at, notes, assigned_to_id, created_by_id, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [dbOrderId, type, scheduled_at, notes || null, assignedId, userId, userName || 'Staff']
    );

    await pool.query(
      `INSERT INTO order_activity_history (activity_id, action, to_status, to_scheduled_at, notes, changed_by_id, changed_by_name)
       VALUES ($1, 'created', $2, $3, $4, $5, $6)`,
      [activity.id, activity.status, activity.scheduled_at, notes || null, userId, userName || 'Staff']
    );

    res.status(201).json({ success: true, message: 'Activity scheduled', data: activity });
  } catch (err) {
    next(err);
  }
};

// GET /api/activities?view=today|upcoming|overdue&status=&type=&assigned_to_id=&order_id=
const getActivities = async (req, res, next) => {
  try {
    const {
      view, status, type, assigned_to_id, order_id,
      page = 1, limit = 50,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (status) { conditions.push(`oa.status = $${params.length + 1}`); params.push(status); }
    if (type)   { conditions.push(`oa.type = $${params.length + 1}`);   params.push(type); }
    if (assigned_to_id) { conditions.push(`oa.assigned_to_id = $${params.length + 1}`); params.push(assigned_to_id); }
    if (order_id) {
      const dbOrderId = await resolveOrderDbId(pool, order_id);
      conditions.push(`oa.order_id = $${params.length + 1}`); params.push(dbOrderId || -1);
    }

    if (view === 'today') {
      conditions.push(`oa.scheduled_at::date = CURRENT_DATE`, `oa.status = 'pending'`);
    } else if (view === 'upcoming') {
      conditions.push(`oa.scheduled_at > NOW()`, `oa.status = 'pending'`);
    } else if (view === 'overdue') {
      conditions.push(`oa.scheduled_at < NOW()`, `oa.status = 'pending'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM order_activities oa ${where}`, params
    );
    const total = parseInt(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT oa.*, ro.order_id AS order_ref, c.name AS customer_name, c.phone AS customer_phone,
              a.name AS assigned_to_name
       FROM order_activities oa
       LEFT JOIN repair_orders ro ON oa.order_id = ro.id
       LEFT JOIN customers c      ON ro.customer_id = c.id
       LEFT JOIN admins a         ON oa.assigned_to_id = a.id
       ${where}
       ORDER BY oa.scheduled_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/activities/:id
const getActivityById = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT oa.*, ro.order_id AS order_ref, c.name AS customer_name, c.phone AS customer_phone,
              a.name AS assigned_to_name
       FROM order_activities oa
       LEFT JOIN repair_orders ro ON oa.order_id = ro.id
       LEFT JOIN customers c      ON ro.customer_id = c.id
       LEFT JOIN admins a         ON oa.assigned_to_id = a.id
       WHERE oa.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Activity not found' });

    const { rows: history } = await pool.query(
      'SELECT * FROM order_activity_history WHERE activity_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], history } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/activities/:id  (reschedule / edit notes / reassign / mark done or cancelled)
const updateActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { scheduled_at, notes, assigned_to_id, status } = req.body;
    const { id: userId, name: userName } = req.user;

    const { rows } = await pool.query('SELECT * FROM order_activities WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Activity not found' });
    const before = rows[0];

    if (status !== undefined && !ACTIVITY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${ACTIVITY_STATUSES.join(', ')}` });
    }

    let assignedId;
    if (assigned_to_id !== undefined) {
      if (assigned_to_id === null || assigned_to_id === '') {
        assignedId = null;
      } else {
        const { rows: staff } = await pool.query(
          `SELECT id FROM admins WHERE id = $1 AND is_active = true AND role IN ('admin','super_admin','telecaller')`,
          [assigned_to_id]
        );
        if (!staff.length) return res.status(400).json({ success: false, message: 'Invalid assigned_to_id' });
        assignedId = staff[0].id;
      }
    }

    // Build the SET list dynamically (same pattern as orderController.updateOrderStatus)
    // rather than COALESCE, since assigned_to_id/completed_at must support being
    // explicitly cleared back to null — not just "leave unchanged when omitted".
    const setFields = [];
    const setParams = [];

    if (scheduled_at) { setFields.push(`scheduled_at = $${setParams.length + 1}`); setParams.push(scheduled_at); }
    if (notes !== undefined) { setFields.push(`notes = $${setParams.length + 1}`); setParams.push(notes || null); }
    if (assigned_to_id !== undefined) { setFields.push(`assigned_to_id = $${setParams.length + 1}`); setParams.push(assignedId); }
    if (status !== undefined) {
      setFields.push(`status = $${setParams.length + 1}`); setParams.push(status);
      setFields.push(`completed_at = $${setParams.length + 1}`); setParams.push(status === 'done' ? new Date() : null);
    }

    if (!setFields.length) return res.status(400).json({ success: false, message: 'No fields to update' });

    setParams.push(id);
    const { rows: [updated] } = await pool.query(
      `UPDATE order_activities SET ${setFields.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    // Audit trail — only log the aspects that actually changed.
    if (scheduled_at && new Date(scheduled_at).getTime() !== new Date(before.scheduled_at).getTime()) {
      await pool.query(
        `INSERT INTO order_activity_history (activity_id, action, from_scheduled_at, to_scheduled_at, changed_by_id, changed_by_name)
         VALUES ($1, 'rescheduled', $2, $3, $4, $5)`,
        [id, before.scheduled_at, updated.scheduled_at, userId, userName || 'Staff']
      );
    }
    if (status && status !== before.status) {
      await pool.query(
        `INSERT INTO order_activity_history (activity_id, action, from_status, to_status, changed_by_id, changed_by_name)
         VALUES ($1, 'status_changed', $2, $3, $4, $5)`,
        [id, before.status, status, userId, userName || 'Staff']
      );
    }

    res.json({ success: true, message: 'Activity updated', data: updated });
  } catch (err) {
    next(err);
  }
};

module.exports = { createActivity, getActivities, getActivityById, updateActivity, ACTIVITY_TYPES, ACTIVITY_STATUSES };
