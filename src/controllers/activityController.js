/**
 * activityController.js — schedules, follow-ups & lead callbacks
 * (callback, repair appointment, follow-up, pickup/delivery, post-repair follow-up)
 *
 * An activity is either order-linked (order_id set — a confirmed repair)
 * or a standalone lead/callback reminder (order_id null, using the
 * customer_name/phone/device_* columns directly) for a prospect who hasn't
 * confirmed a repair yet. Available to owner and telecaller roles. Carries
 * no pricing data, so no role-based redaction is needed here (unlike
 * orderController).
 */

const pool = require('../config/database');

const ACTIVITY_TYPES = ['callback', 'repair_appointment', 'follow_up', 'pickup_delivery', 'post_repair_follow_up'];
const ACTIVITY_STATUSES = ['pending', 'done', 'cancelled'];

// service_estimates: [{ service: 'Display', cost: 17500 }, ...] — the price the
// telecaller quoted for each problem while the lead was undecided. cost may be
// null when a service was noted but no price was given yet.
const parseServiceEstimates = (val) => {
  if (val === undefined || val === null || val === '') return [];
  let arr;
  if (Array.isArray(val)) arr = val;
  else { try { arr = JSON.parse(val); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) => {
      const cost = e?.cost === null || e?.cost === undefined || e?.cost === '' ? null : Number(e.cost);
      return { service: String(e?.service || '').trim().slice(0, 100), cost };
    })
    .filter((e) => e.service && (e.cost === null || (Number.isFinite(e.cost) && e.cost >= 0)));
};

// Plain-text summary kept in the `service` column (VARCHAR(150)) for search.
const summarizeServices = (estimates) =>
  estimates.map((e) => e.service).join(', ').slice(0, 150) || null;

const resolveOrderDbId = async (client, orderIdOrDbId) => {
  const { rows } = await client.query(
    'SELECT id FROM repair_orders WHERE id::text = $1 OR order_id = $1',
    [String(orderIdOrDbId)]
  );
  return rows.length ? rows[0].id : null;
};

const resolveAssignedId = async (assignedToId) => {
  if (!assignedToId) return null;
  const { rows } = await pool.query(
    `SELECT id FROM admins WHERE id = $1 AND is_active = true AND role IN ('admin','super_admin','telecaller')`,
    [assignedToId]
  );
  if (!rows.length) {
    const err = new Error('Invalid assigned_to_id');
    err.status = 400;
    throw err;
  }
  return rows[0].id;
};

// POST /api/activities
// order_id is optional — a lead callback (no order yet) requires `phone` instead.
const createActivity = async (req, res, next) => {
  try {
    const {
      order_id, type, scheduled_at, notes, assigned_to_id,
      customer_name, phone, device_brand, device_model, service, service_estimates,
    } = req.body;

    if (!ACTIVITY_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${ACTIVITY_TYPES.join(', ')}` });
    }
    if (!scheduled_at) {
      return res.status(400).json({ success: false, message: 'scheduled_at is required' });
    }

    let dbOrderId = null;
    if (order_id) {
      dbOrderId = await resolveOrderDbId(pool, order_id);
      if (!dbOrderId) return res.status(404).json({ success: false, message: 'Order not found' });
    } else if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required when this reminder is not linked to an order' });
    }

    const assignedId = await resolveAssignedId(assigned_to_id);
    const { id: userId, name: userName } = req.user;
    const estimates = parseServiceEstimates(service_estimates);
    const serviceSummary = estimates.length ? summarizeServices(estimates) : (service || null);

    const { rows: [activity] } = await pool.query(
      `INSERT INTO order_activities
        (order_id, type, scheduled_at, notes, assigned_to_id, created_by_id, created_by_name,
         customer_name, phone, device_brand, device_model, service, service_estimates)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        dbOrderId, type, scheduled_at, notes || null, assignedId, userId, userName || 'Staff',
        customer_name || null, phone || null, device_brand || null, device_model || null, serviceSummary,
        JSON.stringify(estimates),
      ]
    );

    await pool.query(
      `INSERT INTO order_activity_history (activity_id, action, to_status, to_scheduled_at, notes, changed_by_id, changed_by_name)
       VALUES ($1, 'created', $2, $3, $4, $5, $6)`,
      [activity.id, activity.status, activity.scheduled_at, notes || null, userId, userName || 'Staff']
    );

    res.status(201).json({ success: true, message: 'Reminder scheduled', data: activity });
  } catch (err) {
    next(err);
  }
};

// GET /api/activities?view=today|upcoming|overdue&status=&type=&assigned_to_id=&order_id=&search=
const getActivities = async (req, res, next) => {
  try {
    const {
      view, status, type, assigned_to_id, order_id, search,
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
    if (search) {
      const s = `%${search}%`;
      conditions.push(
        `(oa.customer_name ILIKE $${params.length + 1} OR oa.phone ILIKE $${params.length + 2}
          OR c.name ILIKE $${params.length + 3} OR c.phone ILIKE $${params.length + 4})`
      );
      params.push(s, s, s, s);
    }

    if (view === 'today') {
      conditions.push(`oa.scheduled_at::date = CURRENT_DATE`, `oa.status = 'pending'`);
    } else if (view === 'upcoming') {
      conditions.push(`oa.scheduled_at > NOW()`, `oa.status = 'pending'`);
    } else if (view === 'overdue') {
      conditions.push(`oa.scheduled_at < NOW()`, `oa.status = 'pending'`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = pool.query(
      `SELECT COUNT(*) AS total
       FROM order_activities oa
       LEFT JOIN repair_orders ro ON oa.order_id = ro.id
       LEFT JOIN customers c      ON ro.customer_id = c.id
       ${where}`,
      params
    );

    const listQuery = pool.query(
      `SELECT oa.*, ro.order_id AS order_ref,
              COALESCE(oa.customer_name, c.name)  AS customer_name,
              COALESCE(oa.phone, c.phone)         AS customer_phone,
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

    const [{ rows: countRows }, { rows }] = await Promise.all([countQuery, listQuery]);
    const total = parseInt(countRows[0].total);

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
      `SELECT oa.*, ro.order_id AS order_ref,
              COALESCE(oa.customer_name, c.name)  AS customer_name,
              COALESCE(oa.phone, c.phone)         AS customer_phone,
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

// PATCH /api/activities/:id  (reschedule / edit lead details / reassign / link an order / mark done or cancelled)
const updateActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      scheduled_at, notes, assigned_to_id, status, order_id, type,
      customer_name, phone, device_brand, device_model, service, service_estimates,
    } = req.body;
    const { id: userId, name: userName } = req.user;

    const { rows } = await pool.query('SELECT * FROM order_activities WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Activity not found' });
    const before = rows[0];

    if (status !== undefined && !ACTIVITY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${ACTIVITY_STATUSES.join(', ')}` });
    }
    if (type !== undefined && !ACTIVITY_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${ACTIVITY_TYPES.join(', ')}` });
    }

    let assignedId;
    if (assigned_to_id !== undefined) {
      assignedId = (assigned_to_id === null || assigned_to_id === '') ? null : await resolveAssignedId(assigned_to_id);
    }

    let dbOrderId;
    if (order_id !== undefined) {
      if (order_id === null || order_id === '') {
        dbOrderId = null;
      } else {
        dbOrderId = await resolveOrderDbId(pool, order_id);
        if (!dbOrderId) return res.status(404).json({ success: false, message: 'Order not found' });
      }
    }

    // Build the SET list dynamically (same pattern as orderController.updateOrderStatus)
    // rather than COALESCE, since assigned_to_id/order_id/completed_at must support
    // being explicitly cleared back to null — not just "leave unchanged when omitted".
    const setFields = [];
    const setParams = [];
    const push = (col, val) => { setFields.push(`${col} = $${setParams.length + 1}`); setParams.push(val); };

    if (scheduled_at) push('scheduled_at', scheduled_at);
    if (notes !== undefined) push('notes', notes || null);
    if (type !== undefined) push('type', type);
    if (assigned_to_id !== undefined) push('assigned_to_id', assignedId);
    if (order_id !== undefined) push('order_id', dbOrderId);
    if (customer_name !== undefined) push('customer_name', customer_name || null);
    if (phone !== undefined) push('phone', phone || null);
    if (device_brand !== undefined) push('device_brand', device_brand || null);
    if (device_model !== undefined) push('device_model', device_model || null);
    if (service_estimates !== undefined) {
      const estimates = parseServiceEstimates(service_estimates);
      push('service_estimates', JSON.stringify(estimates));
      push('service', estimates.length ? summarizeServices(estimates) : (service || null));
    } else if (service !== undefined) {
      push('service', service || null);
    }
    if (status !== undefined) {
      push('status', status);
      push('completed_at', status === 'done' ? new Date() : null);
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

    res.json({ success: true, message: 'Reminder updated', data: updated });
  } catch (err) {
    next(err);
  }
};

module.exports = { createActivity, getActivities, getActivityById, updateActivity, ACTIVITY_TYPES, ACTIVITY_STATUSES };
