import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

import authRoutes from './routes/authRoutes';
import menuRoutes from './routes/menuRoutes';
import eventRoutes from './routes/eventRoutes';
import bookRoutes from './routes/bookRoutes';
import searchRoutes from './routes/searchRoutes';
import uploadRoute from './routes/uploadRoute';
import aiRoutes from './routes/aiRoutes';
import paymentRoutes from './routes/paymentRoutes';
import loanRoutes from './routes/loanRoutes';
import notificationRoutes from './routes/notificationRoutes';
import orderRoutes from './routes/orderRoutes';
import couponRoutes from './routes/couponRoutes';
import userRoutes from './routes/userRoutes';
import dashboardRoutes from './routes/dashboardRoutes';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Helper: sensor field sensitif di object log ───────────────
const SENSITIVE_KEYS = new Set(['password', 'token', 'authorization', 'secret', 'x-api-key']);

function sanitizeObject(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE_KEYS.has(k.toLowerCase()) ? [k, '***REDACTED***'] : [k, v]
    )
  );
}

function sanitizeBody(body: any) {
  if (!body || typeof body !== 'object') return body;
  return sanitizeObject(body);
}

// ════════════════════════════════════════════════════════════════
// 1. REQUEST LOGGER — paling awal, sebelum semua middleware lain
// ════════════════════════════════════════════════════════════════
app.use((req: any, _res: Response, next: NextFunction) => {
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
app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'API Backend Rumah Budaya Ratna Berjalan!' });
});

// Rate limiter hanya pada route auth (sensitif)
app.use('/api/auth',        authLimiter, authRoutes);
app.use('/api/menus',       menuRoutes);
app.use('/api/kedai/menus', menuRoutes);
app.use('/api/events',      eventRoutes);
app.use('/api/books',       bookRoutes);
app.use('/api/search',      searchRoutes);
app.use('/api/upload',      uploadRoute);
app.use('/api/ai',          aiRoutes);
app.use('/api/payment',     paymentRoutes);
app.use('/api/loans',       loanRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/orders',       orderRoutes);
app.use('/api/kedai/orders', orderRoutes);
app.use('/api/coupons',      couponRoutes);
app.use('/api/users',        userRoutes);
app.use('/api/members',      userRoutes);
app.use('/api/dashboard',    dashboardRoutes);

// ════════════════════════════════════════════════════════════════
// 6. 404 HANDLER
// ════════════════════════════════════════════════════════════════
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan.' });
});

// ════════════════════════════════════════════════════════════════
// 7. GLOBAL ERROR HANDLER — 4 argumen, selalu paling akhir
// ════════════════════════════════════════════════════════════════
app.use((err: any, req: any, res: Response, _next: NextFunction) => {
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
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

export default app;
module.exports = app;
