/**
 * routes/activities.js — schedules & follow-ups (callback, repair appointment,
 * follow-up, pickup/delivery, post-repair follow-up)
 */

const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();

const { createActivity, getActivities, getActivityById, updateActivity, ACTIVITY_TYPES } = require('../controllers/activityController');
const { authenticate, authorizeAdminOrTelecaller } = require('../middleware/auth');
const validate = require('../middleware/validate');

// order_id is optional (a lead callback has no order yet); the controller
// enforces that phone is present whenever order_id is omitted.
const createRules = [
  body('type').isIn(ACTIVITY_TYPES).withMessage(`type must be one of: ${ACTIVITY_TYPES.join(', ')}`),
  body('scheduled_at').notEmpty().withMessage('scheduled_at is required'),
];

// Owner and telecaller manage schedules; technicians and pricing are out of scope here.
router.use(authenticate, authorizeAdminOrTelecaller);

router.get('/',     getActivities);
router.get('/:id',  getActivityById);
router.post('/',    createRules, validate, createActivity);
router.patch('/:id', updateActivity);

module.exports = router;
