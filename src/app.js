/**
 * app.js — TurboFix Express Application
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');

const { generalLimiter } = require('./middleware/rateLimiter');

const authRoutes        = require('./routes/auth');
const orderRoutes       = require('./routes/orders');
const technicianRoutes  = require('./routes/technicians');
const customerRoutes    = require('./routes/customers');
const paymentRoutes     = require('./routes/payments');
const dashboardRoutes   = require('./routes/dashboard');

const app = express();

// ── Trust proxy (Render sits behind a load balancer) ─────────────────────────
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  // Production
  'https://turbofix.in',
  'https://www.turbofix.in',
  'https://crm.turbofix.in',
  // Netlify deployments
  'https://turbofix-mobiles.netlify.app',
  'https://crm-turbofix.netlify.app',
  // Environment variables
  process.env.FRONTEND_URL,
  process.env.CRM_URL,
  // Local development
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:4000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Static files (uploaded images) ───────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Serve CRM dashboard (development only) ───────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use('/crm', express.static(path.join(__dirname, '../crm')));
}

// ── Rate limiter (global) ─────────────────────────────────────────────────────
app.use('/api', generalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'TurboFix API',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/orders',      orderRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/customers',   customerRoutes);
app.use('/api/payments',    paymentRoutes);
app.use('/api/dashboard',   dashboardRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err.message || err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 10}MB allowed.` });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ success: false, message: 'Too many files. Max 5 allowed.' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'A record with those details already exists.' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (err.message || 'Internal server error'),
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 TurboFix API running on port ${PORT}`);
  console.log(`🔧 Environment → ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
