/**
 * routes/dashboard.js
 */

const express = require('express');
const router  = express.Router();

const {
  getStats, getRecentOrders, getRevenueChart,
  getTechnicianPerformance, getNotifications, getTelecallerStats,
} = require('../controllers/dashboardController');

const { authenticate, authorizeAdmin, authorizeAdminOrTelecaller } = require('../middleware/auth');

router.use(authenticate);

// Owner-only — revenue, cost and technician-earnings analytics.
router.get('/stats',                  authorizeAdmin, getStats);
router.get('/revenue-chart',          authorizeAdmin, getRevenueChart);
router.get('/technician-performance', authorizeAdmin, getTechnicianPerformance);
router.get('/recent-orders',          authorizeAdmin, getRecentOrders);
router.get('/notifications',          authorizeAdmin, getNotifications);

// Shared — no pricing/revenue data, safe for the telecaller dashboard too.
router.get('/telecaller-stats',       authorizeAdminOrTelecaller, getTelecallerStats);

module.exports = router;
