/**
 * orderController.js — Full CRUD for repair orders (PostgreSQL)
 */

const pool = require('../config/database');
const path = require('path');
const fs   = require('fs');
const { sendBookingConfirmation, sendAdminNotification } = require('../services/emailService');
const { isOwner, isTelecaller } = require('../utils/roles');
const { sanitizeOrderForRole, sanitizeOrdersForRole, findProtectedPriceFields } = require('../utils/orderSanitize');

const generateOrderId = () => {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TFX-${rand}`;
};

const parseServices = (val) => {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [val]; }
};

// service_estimates: [{ service: 'Screen Replacement', cost: 2000 }, ...] — the
// per-problem breakdown behind a telecaller's phone quote. Informational only;
// real revenue is still tracked exclusively through the payments table.
const parseServiceEstimates = (val) => {
  if (val === undefined || val === null || val === '') return [];
  let arr;
  if (Array.isArray(val)) arr = val;
  else { try { arr = JSON.parse(val); } catch { return []; } }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((e) => ({ service: String(e?.service || '').trim(), cost: Number(e?.cost) }))
    .filter((e) => e.service && Number.isFinite(e.cost) && e.cost >= 0);
};

// Customer Care attribution must point at an active admins-table user
// (owner or telecaller). Returns the row id, or throws a 400-ish error.
const resolveCustomerCareId = async (client, customerCareId) => {
  if (customerCareId === undefined || customerCareId === null || customerCareId === '') return undefined;
  const { rows } = await client.query(
    `SELECT id FROM admins WHERE id = $1 AND is_active = true AND role IN ('admin','super_admin','telecaller')`,
    [customerCareId]
  );
  if (!rows.length) {
    const err = new Error('Invalid customer_care_id — must be an active internal user');
    err.status = 400;
    throw err;
  }
  return rows[0].id;
};

// POST /api/orders  (public — customer booking)
const createOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      customer_name, customer_phone, customer_email, customer_address,
      device_brand, device_model, services, issue_description,
      service_type, pickup_address, scheduled_date, scheduled_time,
      priority, estimated_cost, service_estimates,
    } = req.body;
    let { customer_care_id } = req.body;

    // req.user is only present on the authenticated /orders/manual route —
    // the public booking route (/orders) has no auth and no attribution.
    // estimated_cost is the phone quote a telecaller gives while booking —
    // that's their job, so both roles may set it (unlike actual_cost, which
    // reflects settled revenue and is owner-only — see updateOrder).
    const requester = req.user;

    // Customer Care attribution: only meaningful on authenticated (manual) creation.
    // Telecallers default to self-attribution unless another eligible user is chosen.
    if (requester) {
      if (customer_care_id === undefined && isTelecaller(requester)) {
        customer_care_id = requester.id;
      }
      customer_care_id = await resolveCustomerCareId(client, customer_care_id);
    } else {
      customer_care_id = undefined;
    }

    const createdById = requester && requester.type === 'admin' ? requester.id : null;

    // Upsert customer by phone
    const { rows: existing } = await client.query(
      'SELECT id FROM customers WHERE phone = $1',
      [customer_phone]
    );

    let customerId;
    if (existing.length) {
      // IMPORTANT: Only increment the order counter.
      // Do NOT overwrite name / email / address — doing so would silently
      // corrupt every previous order for this customer because all orders
      // JOIN on the shared customers row.  Profile edits must go through
      // the dedicated Customer Management endpoint (PUT /api/customers/:id).
      customerId = existing[0].id;
      await client.query(
        `UPDATE customers SET total_orders = total_orders + 1 WHERE id = $1`,
        [customerId]
      );
    } else {
      const { rows: [{ id }] } = await client.query(
        `INSERT INTO customers (name, email, phone, address, total_orders)
         VALUES ($1, $2, $3, $4, 1) RETURNING id`,
        [customer_name, customer_email || null, customer_phone, customer_address || null]
      );
      customerId = id;
    }

    // Generate unique order ID (retry on collision)
    let orderId;
    let attempts = 0;
    do {
      orderId = generateOrderId();
      const { rows: check } = await client.query(
        'SELECT id FROM repair_orders WHERE order_id = $1', [orderId]
      );
      if (!check.length) break;
      attempts++;
    } while (attempts < 5);

    const servicesArr = parseServices(services);
    const serviceEstimatesArr = parseServiceEstimates(service_estimates);

    const { rows: [{ id: dbOrderId }] } = await client.query(
      `INSERT INTO repair_orders
        (order_id, customer_id, device_brand, device_model, services,
         issue_description, service_type, pickup_address,
         scheduled_date, scheduled_time, priority, estimated_cost,
         service_estimates, customer_care_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        orderId, customerId, device_brand, device_model,
        JSON.stringify(servicesArr), issue_description || null,
        service_type, pickup_address || null,
        scheduled_date || null, scheduled_time || null,
        priority || 'normal', estimated_cost || null,
        JSON.stringify(serviceEstimatesArr),
        customer_care_id || null, createdById,
      ]
    );

    // Handle uploaded images
    if (req.files && req.files.length > 0) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const values = req.files.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
      const imageParams = req.files.flatMap((f) => [
        dbOrderId, f.filename, `${baseUrl}/uploads/${f.filename}`,
      ]);
      await client.query(
        `INSERT INTO order_images (order_id, filename, url) VALUES ${values}`,
        imageParams
      );
    }

    // Initial status history
    await client.query(
      `INSERT INTO order_status_history
        (order_id, from_status, to_status, updated_by_type, updated_by_id, updated_by_name, notes)
       VALUES ($1, NULL, 'pending', 'admin', 0, 'System', 'Order created')`,
      [dbOrderId]
    );

    await client.query('COMMIT');

    // Fire both emails non-blocking — booking is already saved, emails are best-effort
    const emailPayload = {
      orderId,
      customerName:  customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      deviceBrand:   device_brand,
      deviceModel:   device_model,
      services:      servicesArr,
      pickupAddress: pickup_address || customer_address,
      scheduledDate: scheduled_date,
      scheduledTime: scheduled_time,
      serviceType:   service_type,
    };

    // 1. Customer confirmation
    if (customer_email) {
      sendBookingConfirmation(emailPayload).catch(() => {});
    }

    // 2. Admin new-booking notification (always fires)
    sendAdminNotification(emailPayload).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Repair order created successfully',
      data: { order_id: orderId, db_id: dbOrderId },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// GET /api/orders  (admin)
const getOrders = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, status, search, technician_id,
      date_from, date_to, priority, customer_care_id,
      sort_by = 'created_at', sort_dir = 'desc',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (status)        { conditions.push(`ro.status = $${params.length + 1}`);              params.push(status); }
    if (technician_id) { conditions.push(`ro.technician_id = $${params.length + 1}`);       params.push(technician_id); }
    if (priority)      { conditions.push(`ro.priority = $${params.length + 1}`);            params.push(priority); }
    if (date_from)     { conditions.push(`ro.created_at::date >= $${params.length + 1}`);   params.push(date_from); }
    if (date_to)       { conditions.push(`ro.created_at::date <= $${params.length + 1}`);   params.push(date_to); }
    if (customer_care_id) { conditions.push(`ro.customer_care_id = $${params.length + 1}`); params.push(customer_care_id); }
    if (search) {
      const s = `%${search}%`;
      conditions.push(
        `(ro.order_id ILIKE $${params.length + 1} OR c.name ILIKE $${params.length + 2} OR c.phone ILIKE $${params.length + 3} OR ro.device_brand ILIKE $${params.length + 4})`
      );
      params.push(s, s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Whitelist sort columns to prevent SQL injection
    const ALLOWED_SORT = {
      created_at:  'ro.created_at',
      updated_at:  'ro.updated_at',
      actual_cost: 'ro.actual_cost',
      estimated_cost: 'ro.estimated_cost',
      status:      'ro.status',
    };
    const orderCol = ALLOWED_SORT[sort_by] || 'ro.created_at';
    const orderDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const countQuery = pool.query(
      `SELECT COUNT(*) AS total FROM repair_orders ro
       LEFT JOIN customers c ON ro.customer_id = c.id ${where}`,
      params
    );

    const listQuery = pool.query(
      `SELECT
         ro.id, ro.order_id, ro.status, ro.priority,
         ro.device_brand, ro.device_model, ro.services,
         ro.service_type, ro.scheduled_date, ro.scheduled_time,
         ro.estimated_cost, ro.service_estimates, ro.actual_cost, ro.warranty_months, ro.imei_number,
         ro.created_at, ro.updated_at,
         c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
         c.email AS customer_email,
         t.id AS technician_id, t.name AS technician_name, t.avatar_color,
         cc.id AS customer_care_id, cc.name AS customer_care_name,
         COALESCE((
           SELECT SUM(p.amount)
           FROM payments p
           WHERE p.order_id = ro.id AND p.status IN ('paid', 'partial')
         ), 0) AS amount_paid
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       LEFT JOIN admins     cc ON ro.customer_care_id = cc.id
       ${where}
       ORDER BY ${orderCol} ${orderDir} NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    const [{ rows: countRows }, { rows: orders }] = await Promise.all([countQuery, listQuery]);
    const total = parseInt(countRows[0].total);

    res.json({
      success: true,
      data: sanitizeOrdersForRole(orders, req.user),
      pagination: {
        page: parseInt(page), limit: parseInt(limit), total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/:id  (admin / technician)
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const isOrderId = id.startsWith('TFX-');
    const field = isOrderId ? 'ro.order_id' : 'ro.id';

    const { rows } = await pool.query(
      `SELECT
         ro.*, c.name AS customer_name, c.phone AS customer_phone,
         c.email AS customer_email, c.address AS customer_address,
         t.name AS technician_name, t.phone AS technician_phone,
         t.specialty AS technician_specialty, t.avatar_color,
         cc.id AS customer_care_id, cc.name AS customer_care_name
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       LEFT JOIN admins     cc ON ro.customer_care_id = cc.id
       WHERE ${field} = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];

    const [{ rows: images }, { rows: history }, { rows: payments }, { rows: activities }] = await Promise.all([
      pool.query(
        'SELECT id, filename, url, uploaded_at FROM order_images WHERE order_id = $1',
        [order.id]
      ),
      pool.query(
        'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
        [order.id]
      ),
      pool.query(
        'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
        [order.id]
      ),
      // Scheduled activities (callbacks, follow-ups, etc.)
      pool.query(
        `SELECT oa.*, a.name AS assigned_to_name
         FROM order_activities oa
         LEFT JOIN admins a ON oa.assigned_to_id = a.id
         WHERE oa.order_id = $1
         ORDER BY oa.scheduled_at ASC`,
        [order.id]
      ),
    ]);

    const full = { ...order, images, history, payments, activities };
    res.json({ success: true, data: sanitizeOrderForRole(full, req.user) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/orders/:id/status  (admin / technician)
const VALID_TRANSITIONS = {
  pending:         ['pickup_assigned', 'under_diagnosis', 'cancelled'],
  pickup_assigned: ['picked_up', 'cancelled'],
  picked_up:       ['under_diagnosis', 'cancelled'],
  under_diagnosis: ['repairing', 'cancelled'],
  repairing:       ['ready', 'cancelled'],
  ready:           ['delivered'],
  delivered:       [],
  cancelled:       [],
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes, technician_id, imei_number, warranty_months } = req.body;
    const { id: userId, type: userType, name: userName } = req.user;

    const { rows } = await pool.query(
      'SELECT id, status, technician_id FROM repair_orders WHERE id = $1 OR order_id = $2',
      [id, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];
    const allowed = VALID_TRANSITIONS[order.status] || [];
    // Only owner roles may jump directly to any status; telecallers and
    // technicians follow the same defined transition graph.
    const canBypassTransitions = isOwner(req.user);

    if (!canBypassTransitions && !allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from '${order.status}' to '${status}'`,
        allowed,
      });
    }

    const updateFields = ['status = $1'];
    const updateParams = [status];

    if (technician_id !== undefined) {
      updateFields.push(`technician_id = $${updateParams.length + 1}`);
      updateParams.push(technician_id || null);
    }

    if (imei_number !== undefined) {
      updateFields.push(`imei_number = $${updateParams.length + 1}`);
      updateParams.push(imei_number || null);
    }

    if (warranty_months !== undefined && warranty_months !== null && warranty_months !== '') {
      updateFields.push(`warranty_months = $${updateParams.length + 1}`);
      updateParams.push(parseInt(warranty_months, 10));
    }

    updateParams.push(order.id);
    await pool.query(
      `UPDATE repair_orders SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    await pool.query(
      `INSERT INTO order_status_history
        (order_id, from_status, to_status, updated_by_type, updated_by_id, updated_by_name, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [order.id, order.status, status, userType, userId, userName || 'Staff', notes || null]
    );

    res.json({ success: true, message: 'Order status updated', data: { order_id: order.id, status } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/orders/:id  (admin — update details)
const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      technician_id, priority,
      admin_notes, technician_notes, warranty_months, imei_number,
      customer_care_id, estimated_cost, service_estimates,
    } = req.body;
    let { actual_cost } = req.body;

    // actual_cost is settled revenue and stays owner-only — reject outright
    // rather than silently dropping it, so a crafted payload gets a clear 403
    // instead of appearing to "succeed" while quietly ignoring the change.
    // estimated_cost (the phone quote) and its per-service breakdown are the
    // telecaller's own job, so both roles may set them.
    if (!isOwner(req.user)) {
      const blocked = findProtectedPriceFields(req.body);
      if (blocked.length) {
        return res.status(403).json({
          success: false,
          message: `Not authorized to change: ${blocked.join(', ')}`,
        });
      }
      actual_cost = undefined;
    }

    const { rows } = await pool.query(
      'SELECT id FROM repair_orders WHERE id = $1 OR order_id = $2', [id, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const dbId = rows[0].id;

    // Customer Care attribution — owner and telecaller may both set/change it;
    // omit the field entirely to preserve whatever is already stored.
    const resolvedCareId = await resolveCustomerCareId(pool, customer_care_id);
    const serviceEstimatesArr = service_estimates !== undefined ? parseServiceEstimates(service_estimates) : undefined;

    await pool.query(
      `UPDATE repair_orders SET
         technician_id     = COALESCE($1, technician_id),
         estimated_cost    = COALESCE($2, estimated_cost),
         actual_cost       = COALESCE($3, actual_cost),
         priority          = COALESCE($4, priority),
         admin_notes       = COALESCE($5, admin_notes),
         technician_notes  = COALESCE($6, technician_notes),
         warranty_months   = COALESCE($7, warranty_months),
         imei_number       = COALESCE($8, imei_number),
         customer_care_id  = COALESCE($9, customer_care_id),
         service_estimates = COALESCE($10, service_estimates)
       WHERE id = $11`,
      [
        technician_id   ?? null,
        estimated_cost  ?? null,
        actual_cost     ?? null,
        priority        ?? null,
        admin_notes     ?? null,
        technician_notes ?? null,
        warranty_months ?? null,
        imei_number     ?? null,
        resolvedCareId  ?? null,
        serviceEstimatesArr !== undefined ? JSON.stringify(serviceEstimatesArr) : null,
        dbId,
      ]
    );

    res.json({ success: true, message: 'Order updated' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/orders/:id/images/:imageId  (admin)
const deleteOrderImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM order_images WHERE id = $1 AND order_id = $2', [imageId, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Image not found' });

    const img = rows[0];
    const filePath = path.join(__dirname, '../../../uploads', img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM order_images WHERE id = $1', [imageId]);
    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/orders/:id/images  (admin)
const addOrderImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT id FROM repair_orders WHERE id = $1 OR order_id = $2', [id, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const dbId = rows[0].id;
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, message: 'No images uploaded' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const values = req.files.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
    const imageParams = req.files.flatMap((f) => [dbId, f.filename, `${baseUrl}/uploads/${f.filename}`]);
    await pool.query(
      `INSERT INTO order_images (order_id, filename, url) VALUES ${values}`,
      imageParams
    );

    res.json({ success: true, message: `${req.files.length} image(s) uploaded` });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/track/:orderId  (public — customer tracking)
const trackOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { rows } = await pool.query(
      `SELECT ro.order_id, ro.status, ro.device_brand, ro.device_model,
              ro.service_type, ro.scheduled_date, ro.scheduled_time,
              ro.warranty_months, ro.created_at, ro.updated_at,
              c.name AS customer_name,
              t.name AS technician_name, t.specialty AS technician_specialty
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       WHERE ro.order_id = $1`,
      [orderId.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];
    const { rows: history } = await pool.query(
      `SELECT to_status, updated_by_name, notes, created_at
       FROM order_status_history
       WHERE order_id = (SELECT id FROM repair_orders WHERE order_id = $1)
       ORDER BY created_at ASC`,
      [orderId.toUpperCase()]
    );

    res.json({ success: true, data: { ...order, history } });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/export  (admin — CSV)
const exportOrders = async (req, res, next) => {
  try {
    const { status, date_from, date_to } = req.query;
    const conditions = [];
    const params     = [];

    if (status)    { conditions.push(`ro.status = $${params.length + 1}`);           params.push(status); }
    if (date_from) { conditions.push(`ro.created_at::date >= $${params.length + 1}`);params.push(date_from); }
    if (date_to)   { conditions.push(`ro.created_at::date <= $${params.length + 1}`);params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: orders } = await pool.query(
      `SELECT ro.order_id, c.name AS customer, c.phone,
              ro.device_brand, ro.device_model, ro.services,
              ro.status, ro.priority, ro.service_type,
              ro.scheduled_date, ro.estimated_cost, ro.actual_cost,
              t.name AS technician, ro.created_at
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       ${where}
       ORDER BY ro.created_at DESC`,
      params
    );

    const header = [
      'Order ID', 'Customer', 'Phone', 'Brand', 'Model', 'Services',
      'Status', 'Priority', 'Service Type', 'Scheduled Date',
      'Est. Cost (₹)', 'Actual Cost (₹)', 'Technician', 'Created At',
    ].join(',');

    const csvRows = orders.map((o) => {
      const services = Array.isArray(o.services)
        ? o.services.join(';')
        : (() => { try { return JSON.parse(o.services).join(';'); } catch { return o.services; } })();
      return [
        o.order_id, `"${o.customer || ''}"`, o.phone,
        o.device_brand, `"${o.device_model}"`, services,
        o.status, o.priority, o.service_type,
        o.scheduled_date || '', o.estimated_cost || '', o.actual_cost || '',
        `"${o.technician || ''}"`, new Date(o.created_at).toISOString(),
      ].join(',');
    });

    const csv = [header, ...csvRows].join('\n');
    const filename = `turbofix-orders-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder, getOrders, getOrderById, updateOrderStatus,
  updateOrder, deleteOrderImage, addOrderImages, trackOrder, exportOrders,
};
