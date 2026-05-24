/**
 * auth.js — JWT verification middleware (PostgreSQL)
 */

const jwt  = require('jsonwebtoken');
const pool = require('../config/database');

// Verify JWT and attach decoded payload to req.user
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const authorizeAdmin = (req, res, next) => {
  if (req.user?.type !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const authorizeSuperAdmin = (req, res, next) => {
  if (req.user?.type !== 'admin' || req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  next();
};

const authorizeStaff = (req, res, next) => {
  if (!['admin', 'technician'].includes(req.user?.type)) {
    return res.status(403).json({ success: false, message: 'Staff access required' });
  }
  next();
};

// Verify account is still active in DB
const requireActiveAccount = async (req, res, next) => {
  try {
    const table = req.user.type === 'admin' ? 'admins' : 'technicians';
    const { rows } = await pool.query(
      `SELECT is_active FROM ${table} WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate, authorizeAdmin, authorizeSuperAdmin, authorizeStaff, requireActiveAccount };
