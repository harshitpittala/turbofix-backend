/**
 * rateLimiter.js — express-rate-limit configurations
 */

const rateLimit = require('express-rate-limit');
const jwt       = require('jsonwebtoken');

const windowMs  = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const maxGeneral = parseInt(process.env.RATE_LIMIT_MAX)     || 100;
const maxAuthenticated = parseInt(process.env.RATE_LIMIT_MAX_AUTH) || 1500;

// Signed-in staff get their own, larger budget keyed by account. Otherwise every
// CRM user behind the shop's shared IP drew from one 100-request pool and the
// whole team started seeing "Failed to load" after a few minutes of normal use.
// Only a token that actually verifies counts — a forged header gets the IP limit.
function verifiedUser(req) {
  if (req._rateLimitUser !== undefined) return req._rateLimitUser;
  let user = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { user = jwt.verify(header.slice(7), process.env.JWT_SECRET); } catch { user = null; }
  }
  req._rateLimitUser = user;
  return user;
}

// ── General API limiter ───────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs,
  max: (req) => (verifiedUser(req) ? maxAuthenticated : maxGeneral),
  keyGenerator: (req) => {
    const user = verifiedUser(req);
    return user ? `user:${user.type}:${user.id}` : `ip:${req.ip}`;
  },
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
