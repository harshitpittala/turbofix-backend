/**
 * expenseController.js — Expense tracking (PostgreSQL)
 */

const pool = require('../config/database');

// GET /api/expenses  (admin)
const getExpenses = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, date_from, date_to } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (date_from) { conditions.push(`expense_date >= $${params.length + 1}`); params.push(date_from); }
    if (date_to)   { conditions.push(`expense_date <= $${params.length + 1}`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM expenses ${where}`, params
    );
    const total = parseInt(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT * FROM expenses ${where}
       ORDER BY expense_date DESC, created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, amount: parseFloat(r.amount) })),
      pagination: {
        page: parseInt(page), limit: parseInt(limit), total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/expenses  (admin)
const createExpense = async (req, res, next) => {
  try {
    const { amount, expense_date, reason, notes } = req.body;

    const { rows: [{ id }] } = await pool.query(
      `INSERT INTO expenses (amount, expense_date, reason, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [amount, expense_date, reason, notes || null]
    );

    res.status(201).json({ success: true, message: 'Expense recorded', data: { id } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/expenses/:id  (admin)
const updateExpense = async (req, res, next) => {
  try {
    const { amount, expense_date, reason, notes } = req.body;
    const { id } = req.params;

    const { rows } = await pool.query('SELECT id FROM expenses WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Expense not found' });

    await pool.query(
      `UPDATE expenses SET
         amount       = COALESCE($1, amount),
         expense_date = COALESCE($2, expense_date),
         reason       = COALESCE($3, reason),
         notes        = $4
       WHERE id = $5`,
      [amount, expense_date, reason, notes || null, id]
    );

    res.json({ success: true, message: 'Expense updated' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/expenses/:id  (admin)
const deleteExpense = async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Expense not found' });

    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
};

// GET /api/expenses/summary  (admin — totals for a date range)
const getExpenseSummary = async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = [];
    const params     = [];

    if (date_from) { conditions.push(`expense_date >= $${params.length + 1}`); params.push(date_from); }
    if (date_to)   { conditions.push(`expense_date <= $${params.length + 1}`); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: [{ total, count }] } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses ${where}`,
      params
    );

    res.json({ success: true, data: { total: parseFloat(total), count: parseInt(count) } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseSummary };
