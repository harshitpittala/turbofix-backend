/**
 * routes/technicians.js
 */

const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();

const {
  getTechnicians, getTechnicianById, createTechnician,
  updateTechnician, toggleTechnicianStatus, resetTechnicianPassword,
} = require('../controllers/technicianController');

const { authenticate, authorizeAdmin, authorizeSuperAdmin, authorizeAdminOrTelecaller } = require('../middleware/auth');
const validate = require('../middleware/validate');

const createRules = [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').trim().notEmpty().withMessage('Phone required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

router.use(authenticate);

// Read-only list/detail — telecaller needs this to assign a technician on an
// order, but "technician management" (create/edit/deactivate/reset-password)
// stays owner-only below.
router.get('/',              authorizeAdminOrTelecaller, getTechnicians);
router.get('/:id',           authorizeAdminOrTelecaller, getTechnicianById);

router.post('/',             authorizeAdmin, createRules, validate, createTechnician);
router.put('/:id',           authorizeAdmin, updateTechnician);
router.patch('/:id/toggle',  authorizeAdmin, toggleTechnicianStatus);

// Super admin only — reset another user's password
router.post('/:id/reset-password',
  authorizeSuperAdmin,
  [body('new_password').isLength({ min: 8 }).withMessage('Min 8 characters')],
  validate,
  resetTechnicianPassword
);

module.exports = router;
