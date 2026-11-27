import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: any;
}

/**
 * Middleware: Verifikasi JWT dari header Authorization: Bearer <token>
 */
export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded; // { id, name, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa.' });
  }
};

/**
 * Middleware: Opsional verifikasi JWT (tidak melempar error jika token kosong)
 */
export const optionalVerifyToken = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decoded;
  } catch (_) {}
  next();
};

/**
 * Middleware: Periksa role user (RBAC)
 * @param {string[]} allowedRoles - Array role yang diizinkan, contoh: ['admin']
 */
export const checkRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Tidak terautentikasi.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Akses ditolak. Hanya ${allowedRoles.join(', ')} yang diizinkan.`,
      });
    }

    next();
  };
};

/**
 * Helper: Ekstrak user_id dari request (req.user, header Authorization Bearer, atau req.body)
 * Tidak memblokir jika token kosong/tidak valid.
 */
export const extractUserId = (req: AuthRequest): number | null => {
  if (req.user?.id) {
    return Number(req.user.id) || null;
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
      if (decoded?.id) {
        req.user = decoded;
        return Number(decoded.id) || null;
      }
    } catch (_) {
      // Abaikan jika token tidak valid/kadaluarsa
    }
  }

  const bodyUserId = req.body?.user_id ?? req.body?.userId;
  if (bodyUserId !== undefined && bodyUserId !== null && bodyUserId !== '') {
    const parsed = Number(bodyUserId);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

module.exports = { verifyToken, optionalVerifyToken, checkRole, extractUserId };
