/**
 * authController.js — Admin & Technician authentication (PostgreSQL)
 */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/database');

const signToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

// POST /api/auth/admin/login
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM admins WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await pool.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id]);

    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = signToken(
      { id: admin.id, email: admin.email, role: admin.role, type: 'admin' },
      expiresIn
    );

    res.json({
      success: true,
      token,
      expiresIn,
      user: {
        id:    admin.id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
        type:  'admin',
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/technician/login
const technicianLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM technicians WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const tech = rows[0];
    const valid = await bcrypt.compare(password, tech.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const expiresIn = '12h';
    const token = signToken(
      { id: tech.id, email: tech.email, type: 'technician' },
      expiresIn
    );

    res.json({
      success: true,
      token,
      expiresIn,
      user: {
        id:             tech.id,
        name:           tech.name,
        email:          tech.email,
        phone:          tech.phone,
        specialty:      tech.specialty,
        experience_yrs: tech.experience_yrs,
        avatar_color:   tech.avatar_color,
        type:           'technician',
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    const { id, type } = req.user;
    let user;

    if (type === 'admin') {
      const { rows } = await pool.query(
        'SELECT id, name, email, role, is_active, last_login, created_at FROM admins WHERE id = $1',
        [id]
      );
      user = rows[0];
    } else {
      const { rows } = await pool.query(
        'SELECT id, name, email, phone, specialty, experience_yrs, is_active, avatar_color, created_at FROM technicians WHERE id = $1',
        [id]
      );
      user = rows[0];
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: { ...user, type } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const { id, type } = req.user;

    const table = type === 'admin' ? 'admins' : 'technicians';
    const { rows } = await pool.query(`SELECT password_hash FROM ${table} WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [hash, id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { adminLogin, technicianLogin, getMe, changePassword };
