/**
 * staffController.js — Admins-table user management (owner, admin, telecaller)
 *
 * Mirrors technicianController's shape/conventions. Lets the owner provision
 * telecaller accounts and gives the CRM a source for the "Customer Care"
 * attribution dropdown (eligible internal users).
 */

const bcrypt = require('bcryptjs');
const pool   = require('../config/database');

const CREATABLE_ROLES = ['admin', 'telecaller']; // super_admin is never created via this API

// GET /api/staff  (owner or telecaller — read-only directory, no password hashes)
const getStaff = async (req, res, next) => {
  try {
    const { role, active } = req.query;
    const conditions = [];
    const params     = [];

    if (role)   { conditions.push(`role = $${params.length + 1}`);      params.push(role); }
    if (active !== undefined) { conditions.push(`is_active = $${params.length + 1}`); params.push(active === 'true'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT id, name, email, role, is_active, last_login, created_at
       FROM admins ${where} ORDER BY name ASC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// GET /api/staff/:id  (owner)
const getStaffById = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, last_login, created_at FROM admins WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Staff user not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/staff  (owner — create an admin or telecaller account)
const createStaff = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!CREATABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `role must be one of: ${CREATABLE_ROLES.join(', ')}` });
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM admins WHERE email = $1', [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);

    const { rows: [{ id }] } = await pool.query(
      `INSERT INTO admins (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, email.toLowerCase().trim(), hash, role]
    );

    res.status(201).json({ success: true, message: 'Staff account created', data: { id } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/staff/:id  (owner — name/role/active; never touches super_admin rows)
const updateStaff = async (req, res, next) => {
  try {
    const { name, role, is_active } = req.body;
    const { id } = req.params;

    const { rows } = await pool.query('SELECT id, role FROM admins WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Staff user not found' });
    if (rows[0].role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot modify a super admin account' });
    }
    if (role !== undefined && !CREATABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `role must be one of: ${CREATABLE_ROLES.join(', ')}` });
    }

    await pool.query(
      `UPDATE admins SET
         name      = COALESCE($1, name),
         role      = COALESCE($2, role),
         is_active = COALESCE($3, is_active)
       WHERE id = $4`,
      [name, role, is_active, id]
    );

    res.json({ success: true, message: 'Staff account updated' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/staff/:id/toggle  (owner)
const toggleStaffStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, role, is_active FROM admins WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Staff user not found' });
    if (rows[0].role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot deactivate a super admin account' });
    }

    const newStatus = !rows[0].is_active;
    await pool.query('UPDATE admins SET is_active = $1 WHERE id = $2', [newStatus, id]);

    res.json({ success: true, message: `Account ${newStatus ? 'activated' : 'deactivated'}`, is_active: newStatus });
  } catch (err) {
    next(err);
  }
};

// POST /api/staff/:id/reset-password  (super admin only)
const resetStaffPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;
    const { rows } = await pool.query('SELECT id, role FROM admins WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Staff user not found' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStaff, getStaffById, createStaff, updateStaff, toggleStaffStatus, resetStaffPassword,
};
