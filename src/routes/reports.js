/**
 * routes/reports.js — owner-only cross-role reports
 */

const express = require('express');
const router  = express.Router();

const { getCustomerCareReport } = require('../controllers/reportController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

router.use(authenticate, authorizeAdmin);

router.get('/customer-care', getCustomerCareReport);

module.exports = router;
