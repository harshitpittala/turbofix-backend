/**
 * rateLimiter.js — express-rate-limit configurations
 */

const rateLimit = require('express-rate-limit');

const windowMs  = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const maxGeneral = parseInt(process.env.RATE_LIMIT_MAX)     || 100;

// ── General API limiter ───────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs,
  max: maxGeneral,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// ── Strict auth limiter (login attempts) ─────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

// ── Public booking endpoint (lenient) ────────────────────────────────────────
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many booking attempts. Please try again later.' },
});

module.exports = { generalLimiter, authLimiter, bookingLimiter };
