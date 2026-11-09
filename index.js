const crypto  = require('crypto');
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes    = require('./routes/authRoutes');
const menuRoutes    = require('./routes/menuRoutes');
const eventRoutes   = require('./routes/eventRoutes');
const bookRoutes    = require('./routes/bookRoutes');
const searchRoutes  = require('./routes/searchRoutes');
const uploadRoute   = require('./routes/uploadRoute');
const aiRoutes      = require('./routes/aiRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Helper: sensor field sensitif di object log ───────────────
const SENSITIVE_KEYS = new Set(['password', 'token', 'authorization', 'secret', 'x-api-key']);

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE_KEYS.has(k.toLowerCase()) ? [k, '***REDACTED***'] : [k, v]
    )
  );
}

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  return sanitizeObject(body);
}

// ════════════════════════════════════════════════════════════════
// 1. REQUEST LOGGER — paling awal, sebelum semua middleware lain
// ════════════════════════════════════════════════════════════════
app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  console.log(JSON.stringify({
    requestId : req.requestId,
    method    : req.method,
    path      : req.path,
    ip        : req.ip,
    userAgent : req.headers['user-agent'],
    // Authorization header disensor
    authorization: req.headers['authorization'] ? '***REDACTED***' : undefined,
    timestamp : new Date().toISOString(),
  }));
  next();
});

// ════════════════════════════════════════════════════════════════
// 2. HELMET — security headers HTTP
// ════════════════════════════════════════════════════════════════
app.use(helmet());

// ════════════════════════════════════════════════════════════════
// 3. RATE LIMITER — untuk endpoint autentikasi (429)
// ════════════════════════════════════════════════════════════════
const authLimiter = rateLimit({
  windowMs       : 15 * 60 * 1000, // 15 menit
  max            : 20,              // maks 20 request per window
  standardHeaders: true,
  legacyHeaders  : false,
  message        : {
    message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.',
  },
});

// ════════════════════════════════════════════════════════════════
// 4. CORS + BODY PARSER
// ════════════════════════════════════════════════════════════════
app.use(cors());
app.use(express.json());

// ════════════════════════════════════════════════════════════════
// 5. ROUTES
// ════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ message: 'API Backend Rumah Budaya Ratna Berjalan!' });
});

// Rate limiter hanya pada route auth (sensitif)
app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/menus',   menuRoutes);
app.use('/api/events',  eventRoutes);
app.use('/api/books',   bookRoutes);
app.use('/api/search',  searchRoutes);
app.use('/api/upload',  uploadRoute);
app.use('/api/ai',      aiRoutes);
app.use('/api/payment', paymentRoutes);

// ════════════════════════════════════════════════════════════════
// 6. 404 HANDLER
// ════════════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan.' });
});

// ════════════════════════════════════════════════════════════════
// 7. GLOBAL ERROR HANDLER — 4 argumen, selalu paling akhir
//    Stack trace TIDAK dikirim ke client (hanya di-log server-side)
// ════════════════════════════════════════════════════════════════
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const requestId  = req.requestId || 'unknown';
  const statusCode = err.status || err.statusCode || 500;

  // Log server-side — stack trace hanya di non-production, body disensor
  console.error(JSON.stringify({
    requestId,
    type     : 'ERROR',
    status   : statusCode,
    message  : err.message,
    path     : req.path,
    method   : req.method,
    // stack hanya tampil di development, TIDAK di production
    stack    : process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  }));

  // Response ke client: 5xx TIDAK membocorkan detail internal
  res.status(statusCode).json({
    message  : statusCode >= 500
      ? 'Terjadi kesalahan pada server. Silakan coba lagi.'
      : (err.message || 'Terjadi kesalahan.'),
    requestId,
  });
});

// ════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
