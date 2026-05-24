/**
 * routes/auth.js
 */

const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();

const { adminLogin, technicianLogin, getMe, changePassword } = require('../controllers/authController');
const { authenticate, authorizeStaff } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const pwRules = [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

// POST /api/auth/admin/login
router.post('/admin/login', authLimiter, loginRules, validate, adminLogin);

// POST /api/auth/technician/login
router.post('/technician/login', authLimiter, loginRules, validate, technicianLogin);

// GET /api/auth/me
router.get('/me', authenticate, authorizeStaff, getMe);

// POST /api/auth/change-password
router.post('/change-password', authenticate, authorizeStaff, pwRules, validate, changePassword);

module.exports = router;
