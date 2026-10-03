/**
 * paymentController.js — Payment management (PostgreSQL)
 */

const pool = require('../config/database');

// POST /api/payments  (admin)
const createPayment = async (req, res, next) => {
  try {
    const { order_id, amount, method, status = 'paid', transaction_id, notes } = req.body;

    // Resolve order: accept either "TFX-528757" (order_id string) or a raw integer (db id).
    // IMPORTANT: never cast a TFX- string to ::int — Postgres will throw.
    const isNumericId = /^\d+$/.test(String(order_id));

    const { rows: orders } = isNumericId
      ? await pool.query(
          'SELECT id FROM repair_orders WHERE order_id = $1 OR id = $2',
          [order_id, parseInt(order_id, 10)]
        )
      : await pool.query(
          'SELECT id FROM repair_orders WHERE order_id = $1',
          [order_id]
        );

    if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found' });
    const dbOrderId = orders[0].id;

    const { rows: [{ id }] } = await pool.query(
      `INSERT INTO payments (order_id, amount, method, status, transaction_id, notes, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        dbOrderId, amount, method, status,
        transaction_id || null,
        notes || null,
        status === 'paid' ? new Date() : null,
      ]
    );

    if (status === 'paid') {
      await pool.query(
        `UPDATE repair_orders SET actual_cost = $1 WHERE id = $2`,
        [amount, dbOrderId]
      );
    }

    res.status(201).json({ success: true, message: 'Payment recorded', data: { id } });
  } catch (err) {
    next(err);
  }
};

// GET /api/payments  (admin)
const getPayments = async (req, res, next) => {
  try {
    const { order_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (order_id) {
      conditions.push(
        `(p.order_id = $${params.length + 1} OR ro.order_id = $${params.length + 2})`
      );
      params.push(order_id, order_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT p.*, ro.order_id AS order_ref, ro.status AS order_status, c.name AS customer_name
       FROM payments p
       INNER JOIN repair_orders ro ON p.order_id = ro.id
       LEFT JOIN customers c ON ro.customer_id = c.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/payments/:id  (admin)
const updatePayment = async (req, res, next) => {
  try {
    const { status, transaction_id, notes } = req.body;
    const { id } = req.params;

    const { rows } = await pool.query('SELECT id FROM payments WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });

    await pool.query(
      `UPDATE payments SET
         status         = COALESCE($1, status),
         transaction_id = COALESCE($2, transaction_id),
         notes          = COALESCE($3, notes),
         paid_at        = CASE WHEN $4 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END
       WHERE id = $5`,
      [status, transaction_id, notes, status, id]
    );

    res.json({ success: true, message: 'Payment updated' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/payments/:id  (admin)
// Removes a payment record (e.g. entered by mistake). If the order's
// actual_cost was set from this payment, fall back to the latest remaining
// paid payment so the order doesn't keep showing a settled amount that no
// longer exists.
const deletePayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'DELETE FROM payments WHERE id = $1 RETURNING order_id, amount, status',
      [req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    const deleted = rows[0];

    if (deleted.status === 'paid') {
      await client.query(
        `UPDATE repair_orders ro SET actual_cost = (
           SELECT p.amount FROM payments p
           WHERE p.order_id = ro.id AND p.status = 'paid'
           ORDER BY p.paid_at DESC NULLS LAST, p.id DESC LIMIT 1
         )
         WHERE ro.id = $1 AND ro.actual_cost = $2`,
        [deleted.order_id, deleted.amount]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};

// GET /api/payments/summary  (admin — revenue stats)
// Payments on cancelled orders are excluded from revenue.
const getPaymentSummary = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = ["p.status = 'paid'", "ro.status <> 'cancelled'"];
    const params     = [];

    if (date_from) { conditions.push(`p.paid_at::date >= $${params.length + 1}`); params.push(date_from); }
    if (date_to)   { conditions.push(`p.paid_at::date <= $${params.length + 1}`); params.push(date_to); }

    const from  = 'FROM payments p INNER JOIN repair_orders ro ON p.order_id = ro.id';
    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows: [{ total, count }] } = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS total, COUNT(*) AS count ${from} ${where}`,
      params
    );

    const { rows: byMethod } = await pool.query(
      `SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount, COUNT(*) AS count
       ${from} ${where} GROUP BY p.method`,
      params
    );

    const { rows: daily } = await pool.query(
      `SELECT p.paid_at::date AS date, COALESCE(SUM(p.amount), 0) AS amount
       ${from} ${where}
       GROUP BY p.paid_at::date
       ORDER BY date DESC LIMIT 30`,
      params
    );

    res.json({
      success: true,
      data: {
        total:     parseFloat(total),
        count:     parseInt(count),
        by_method: byMethod.map((r) => ({ ...r, amount: parseFloat(r.amount), count: parseInt(r.count) })),
        daily:     daily.map((r) => ({ ...r, amount: parseFloat(r.amount) })),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { createPayment, getPayments, updatePayment, deletePayment, getPaymentSummary };
