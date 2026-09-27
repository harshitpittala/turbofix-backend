/**
 * routes/staff.js — admins-table user management (owner, admin, telecaller)
 */

const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();

const {
  getStaff, getStaffById, createStaff, updateStaff, toggleStaffStatus, resetStaffPassword,
} = require('../controllers/staffController');

const { authenticate, authorizeAdmin, authorizeSuperAdmin, authorizeAdminOrTelecaller } = require('../middleware/auth');
const validate = require('../middleware/validate');

const createRules = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['admin', 'telecaller']).withMessage('role must be admin or telecaller'),
];

router.use(authenticate);

// Read-only directory — needed by both roles to populate the "Customer Care" picker.
router.get('/',    authorizeAdminOrTelecaller, getStaff);
router.get('/:id', authorizeAdminOrTelecaller, getStaffById);

// Account management stays owner-only ("user management" per the telecaller RBAC spec).
router.post('/',            authorizeAdmin, createRules, validate, createStaff);
router.put('/:id',          authorizeAdmin, updateStaff);
router.patch('/:id/toggle', authorizeAdmin, toggleStaffStatus);

router.post('/:id/reset-password',
  authorizeSuperAdmin,
  [body('new_password').isLength({ min: 8 }).withMessage('Min 8 characters')],
  validate,
  resetStaffPassword
);

module.exports = router;
