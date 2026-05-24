/**
 * customerController.js — Customer management (PostgreSQL)
 */

const pool = require('../config/database');

// GET /api/customers  (admin)
const getCustomers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (search) {
      const s = `%${search}%`;
      conditions.push(
        `(name ILIKE $${params.length + 1} OR phone ILIKE $${params.length + 2} OR email ILIKE $${params.length + 3})`
      );
      params.push(s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM customers ${where}`, params
    );
    const total = parseInt(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT id, name, email, phone, address, total_orders, created_at
       FROM customers ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page), limit: parseInt(limit), total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/customers/:id  (admin)
const getCustomerById = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });

    const customer = rows[0];

    const { rows: orders } = await pool.query(
      `SELECT ro.order_id, ro.status, ro.device_brand, ro.device_model,
              ro.service_type, ro.estimated_cost, ro.actual_cost, ro.created_at,
              t.name AS technician_name
       FROM repair_orders ro
       LEFT JOIN technicians t ON ro.technician_id = t.id
       WHERE ro.customer_id = $1
       ORDER BY ro.created_at DESC`,
      [customer.id]
    );

    const { rows: [{ total_paid }] } = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS total_paid
       FROM payments p
       INNER JOIN repair_orders ro ON p.order_id = ro.id
       WHERE ro.customer_id = $1 AND p.status = 'paid'`,
      [customer.id]
    );

    res.json({
      success: true,
      data: { ...customer, orders, total_paid: parseFloat(total_paid) },
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/customers/:id  (admin)
const updateCustomer = async (req, res, next) => {
  try {
    const { name, email, phone, address } = req.body;
    const { id } = req.params;

    const { rows } = await pool.query('SELECT id FROM customers WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Customer not found' });

    await pool.query(
      `UPDATE customers SET
         name    = COALESCE($1, name),
         email   = COALESCE($2, email),
         phone   = COALESCE($3, phone),
         address = COALESCE($4, address)
       WHERE id = $5`,
      [name, email, phone, address, id]
    );

    res.json({ success: true, message: 'Customer updated' });
  } catch (err) {
    next(err);
  }
};

// GET /api/customers/lookup?phone=xxx  (admin)
const lookupCustomer = async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

    const { rows } = await pool.query(
      'SELECT id, name, email, phone, address, total_orders FROM customers WHERE phone = $1',
      [phone]
    );

    res.json({ success: true, found: !!rows.length, data: rows[0] || null });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCustomers, getCustomerById, updateCustomer, lookupCustomer };
