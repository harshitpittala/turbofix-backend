/**
 * routes/dashboard.js
 */

const express = require('express');
const router  = express.Router();

const {
  getStats, getRecentOrders, getRevenueChart,
  getTechnicianPerformance, getNotifications,
} = require('../controllers/dashboardController');

const { authenticate, authorizeAdmin } = require('../middleware/auth');

router.use(authenticate, authorizeAdmin);

router.get('/stats',                  getStats);
router.get('/recent-orders',          getRecentOrders);
router.get('/revenue-chart',          getRevenueChart);
router.get('/technician-performance', getTechnicianPerformance);
router.get('/notifications',          getNotifications);

module.exports = router;
