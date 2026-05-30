/**
 * orderController.js — Full CRUD for repair orders (PostgreSQL)
 */

const pool = require('../config/database');
const path = require('path');
const fs   = require('fs');
const { sendBookingConfirmation, sendAdminNotification } = require('../services/emailService');

const generateOrderId = () => {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TFX-${rand}`;
};

const parseServices = (val) => {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return [val]; }
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
    } = req.body;

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

    const { rows: [{ id: dbOrderId }] } = await client.query(
      `INSERT INTO repair_orders
        (order_id, customer_id, device_brand, device_model, services,
         issue_description, service_type, pickup_address,
         scheduled_date, scheduled_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        orderId, customerId, device_brand, device_model,
        JSON.stringify(servicesArr), issue_description || null,
        service_type, pickup_address || null,
        scheduled_date || null, scheduled_time || null,
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
      date_from, date_to, priority,
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

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM repair_orders ro
       LEFT JOIN customers c ON ro.customer_id = c.id ${where}`,
      params
    );
    const total = parseInt(countRows[0].total);

    const { rows: orders } = await pool.query(
      `SELECT
         ro.id, ro.order_id, ro.status, ro.priority,
         ro.device_brand, ro.device_model, ro.services,
         ro.service_type, ro.scheduled_date, ro.scheduled_time,
         ro.estimated_cost, ro.actual_cost, ro.warranty_months,
         ro.created_at, ro.updated_at,
         c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
         c.email AS customer_email,
         t.id AS technician_id, t.name AS technician_name, t.avatar_color,
         COALESCE((
           SELECT SUM(p.amount)
           FROM payments p
           WHERE p.order_id = ro.id AND p.status IN ('paid', 'partial')
         ), 0) AS amount_paid
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       ${where}
       ORDER BY ${orderCol} ${orderDir} NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: orders,
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
         t.specialty AS technician_specialty, t.avatar_color
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       WHERE ${field} = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];

    // Fetch images
    const { rows: images } = await pool.query(
      'SELECT id, filename, url, uploaded_at FROM order_images WHERE order_id = $1',
      [order.id]
    );

    // Fetch status history
    const { rows: history } = await pool.query(
      'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
      [order.id]
    );

    // Fetch payments
    const { rows: payments } = await pool.query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [order.id]
    );

    res.json({ success: true, data: { ...order, images, history, payments } });
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
    const { status, notes, technician_id } = req.body;
    const { id: userId, type: userType, name: userName } = req.user;

    const { rows } = await pool.query(
      'SELECT id, status, technician_id FROM repair_orders WHERE id = $1 OR order_id = $2',
      [id, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = rows[0];
    const allowed = VALID_TRANSITIONS[order.status] || [];
    const isAdmin = req.user.type === 'admin' || req.user.role === 'admin' || req.user.role === 'super_admin';

    if (!isAdmin && !allowed.includes(status)) {
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
      technician_id, estimated_cost, actual_cost, priority,
      admin_notes, technician_notes, warranty_months,
    } = req.body;

    const { rows } = await pool.query(
      'SELECT id FROM repair_orders WHERE id = $1 OR order_id = $2', [id, id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order not found' });

    const dbId = rows[0].id;

    await pool.query(
      `UPDATE repair_orders SET
         technician_id    = COALESCE($1, technician_id),
         estimated_cost   = COALESCE($2, estimated_cost),
         actual_cost      = COALESCE($3, actual_cost),
         priority         = COALESCE($4, priority),
         admin_notes      = COALESCE($5, admin_notes),
         technician_notes = COALESCE($6, technician_notes),
         warranty_months  = COALESCE($7, warranty_months)
       WHERE id = $8`,
      [
        technician_id   ?? null,
        estimated_cost  ?? null,
        actual_cost     ?? null,
        priority        ?? null,
        admin_notes     ?? null,
        technician_notes ?? null,
        warranty_months ?? null,
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
