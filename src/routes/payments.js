/**
 * routes/payments.js
 */

const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();

const { createPayment, getPayments, updatePayment, getPaymentSummary } = require('../controllers/paymentController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');

const createRules = [
  body('order_id').notEmpty().withMessage('Order ID required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method').isIn(['cash','upi','card','bank_transfer','other']).withMessage('Invalid payment method'),
];

router.use(authenticate, authorizeAdmin);

router.get('/summary', getPaymentSummary);
router.get('/',        getPayments);
router.post('/',       createRules, validate, createPayment);
router.patch('/:id',   updatePayment);

module.exports = router;
