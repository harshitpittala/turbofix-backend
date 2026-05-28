/**
 * routes/orders.js
 */

const express = require('express');
const { body, param } = require('express-validator');
const router  = express.Router();

const {
  createOrder, getOrders, getOrderById, updateOrderStatus,
  updateOrder, deleteOrderImage, addOrderImages, trackOrder, exportOrders,
} = require('../controllers/orderController');
const { sendBookingConfirmation } = require('../services/emailService');

const { authenticate, authorizeAdmin, authorizeStaff } = require('../middleware/auth');
const { bookingLimiter } = require('../middleware/rateLimiter');
const validate  = require('../middleware/validate');
const upload    = require('../config/multer');

// ── Public endpoints ──────────────────────────────────────────────────────────

// GET /api/orders/track/:orderId  — customer order tracking
router.get('/track/:orderId', trackOrder);

// POST /api/orders/test-email  — admin-only SMTP test (no DB write)
router.post('/test-email', authenticate, authorizeAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'email required in body' });
  try {
    await sendBookingConfirmation({
      orderId:       'TFX-TEST01',
      customerName:  'Test User',
      customerEmail: email,
      deviceBrand:   'Samsung',
      deviceModel:   'Galaxy S24',
      services:      ['Screen Replacement'],
      pickupAddress: '11-1-441, Aghapura, Nampally, Hyderabad',
      scheduledDate: new Date().toISOString().slice(0, 10),
      scheduledTime: '10:00 AM – 12:00 PM',
    });
    res.json({ success: true, message: `Test email sent to ${email}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/orders  — customer creates order (booking form)
const createRules = [
  body('customer_name').trim().notEmpty().withMessage('Customer name required'),
  body('customer_phone').trim().notEmpty().withMessage('Phone required'),
  body('device_brand').trim().notEmpty().withMessage('Device brand required'),
  body('device_model').trim().notEmpty().withMessage('Device model required'),
  body('services').notEmpty().withMessage('At least one service required'),
  body('service_type').isIn(['walk-in','pickup']).withMessage('Invalid service type'),
];
router.post('/', bookingLimiter, upload.array('images', 5), createRules, validate, createOrder);

// ── Admin endpoints ───────────────────────────────────────────────────────────

// GET /api/orders/export
router.get('/export', authenticate, authorizeAdmin, exportOrders);

// GET /api/orders
router.get('/', authenticate, authorizeAdmin, getOrders);

// GET /api/orders/:id  (admin/tech can view)
router.get('/:id', authenticate, authorizeStaff, getOrderById);

// PATCH /api/orders/:id/status
const statusRules = [
  body('status').notEmpty().withMessage('Status required'),
];
router.patch('/:id/status', authenticate, authorizeStaff, statusRules, validate, updateOrderStatus);

// PATCH /api/orders/:id  (admin — update cost / technician / notes)
router.patch('/:id', authenticate, authorizeAdmin, updateOrder);

// POST /api/orders/:id/images
router.post('/:id/images', authenticate, authorizeAdmin, upload.array('images', 5), addOrderImages);

// DELETE /api/orders/:orderId/images/:imageId
router.delete('/:id/images/:imageId', authenticate, authorizeAdmin, deleteOrderImage);

module.exports = router;
