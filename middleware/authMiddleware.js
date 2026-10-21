const jwt = require('jsonwebtoken');

/**
 * Middleware: Verifikasi JWT dari header Authorization: Bearer <token>
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, name, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kadaluarsa.' });
  }
};

/**
 * Middleware: Periksa role user (RBAC)
 * @param {string[]} allowedRoles - Array role yang diizinkan, contoh: ['admin']
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
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

module.exports = { verifyToken, checkRole };
