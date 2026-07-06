/**
 * routes/contact.js — public "Contact Us" form submission
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const router = express.Router();

const validate = require('../middleware/validate');
const { sendContactMessage } = require('../services/emailService');

// ── Rate limiter — generous but prevents scripted spam ───────────────────────
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages sent. Please try again later or call us directly.' },
});

const rules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('subject').optional({ checkFalsy: true }).trim().isLength({ max: 150 }),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 5000 }),
];

// POST /api/contact — public contact form
router.post('/', contactLimiter, rules, validate, async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  try {
    await sendContactMessage({ name, email, phone, subject, message });
    res.json({ success: true, message: "Message sent! We'll reply within 2 hours." });
  } catch (err) {
    console.error('❌ [contact] Failed to send:', err.message);
    res.status(502).json({
      success: false,
      message: "We couldn't send your message right now. Please call or WhatsApp us at +91 86396 05147.",
    });
  }
});

module.exports = router;
