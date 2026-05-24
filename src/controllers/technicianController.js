/**
 * technicianController.js — Technician management (PostgreSQL)
 */

const bcrypt = require('bcryptjs');
const pool   = require('../config/database');

// GET /api/technicians
const getTechnicians = async (req, res, next) => {
  try {
    const { active } = req.query;
    const params = [];
    const where  = active !== undefined
      ? `WHERE is_active = $${params.push(active === 'true') && params.length}`
      : '';

    const { rows } = await pool.query(
      `SELECT id, name, email, phone, specialty, experience_yrs,
              is_active, avatar_color, created_at,
              (SELECT COUNT(*) FROM repair_orders WHERE technician_id = technicians.id) AS total_orders,
              (SELECT COUNT(*) FROM repair_orders WHERE technician_id = technicians.id
               AND status NOT IN ('delivered', 'cancelled')) AS active_orders
       FROM technicians ${where} ORDER BY name ASC`,
      params
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        total_orders:  parseInt(r.total_orders),
        active_orders: parseInt(r.active_orders),
      })),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/technicians/:id
const getTechnicianById = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, specialty, experience_yrs,
              is_active, avatar_color, created_at
       FROM technicians WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Technician not found' });

    const tech = rows[0];

    const { rows: orders } = await pool.query(
      `SELECT ro.order_id, ro.status, ro.device_brand, ro.device_model, ro.created_at,
              c.name AS customer_name
       FROM repair_orders ro
       LEFT JOIN customers c ON ro.customer_id = c.id
       WHERE ro.technician_id = $1
       ORDER BY ro.created_at DESC LIMIT 10`,
      [tech.id]
    );

    res.json({ success: true, data: { ...tech, recent_orders: orders } });
  } catch (err) {
    next(err);
  }
};

// POST /api/technicians
const createTechnician = async (req, res, next) => {
  try {
    const { name, email, phone, password, specialty, experience_yrs, avatar_color } = req.body;

    const { rows: existing } = await pool.query(
      'SELECT id FROM technicians WHERE email = $1', [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);

    const { rows: [{ id }] } = await pool.query(
      `INSERT INTO technicians (name, email, phone, password_hash, specialty, experience_yrs, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        name, email.toLowerCase().trim(), phone, hash,
        specialty || null,
        parseInt(experience_yrs) || 0,
        avatar_color || '#00AAFF',
      ]
    );

    res.status(201).json({ success: true, message: 'Technician created', data: { id } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/technicians/:id
const updateTechnician = async (req, res, next) => {
  try {
    const { name, phone, specialty, experience_yrs, avatar_color, is_active } = req.body;
    const { id } = req.params;

    const { rows } = await pool.query('SELECT id FROM technicians WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Technician not found' });

    await pool.query(
      `UPDATE technicians SET
         name           = COALESCE($1, name),
         phone          = COALESCE($2, phone),
         specialty      = COALESCE($3, specialty),
         experience_yrs = COALESCE($4, experience_yrs),
         avatar_color   = COALESCE($5, avatar_color),
         is_active      = COALESCE($6, is_active)
       WHERE id = $7`,
      [name, phone, specialty, experience_yrs, avatar_color, is_active, id]
    );

    res.json({ success: true, message: 'Technician updated' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/technicians/:id/toggle
const toggleTechnicianStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT id, is_active FROM technicians WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Technician not found' });

    const newStatus = !rows[0].is_active;
    await pool.query('UPDATE technicians SET is_active = $1 WHERE id = $2', [newStatus, id]);

    res.json({
      success: true,
      message: `Technician ${newStatus ? 'activated' : 'deactivated'}`,
      is_active: newStatus,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/technicians/:id/reset-password  (super_admin only)
const resetTechnicianPassword = async (req, res, next) => {
  try {
    const { new_password } = req.body;
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE technicians SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTechnicians, getTechnicianById, createTechnician,
  updateTechnician, toggleTechnicianStatus, resetTechnicianPassword,
};
