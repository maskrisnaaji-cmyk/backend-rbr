const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  logout, 
  verifyResetIdentity, 
  resetPasswordDirect 
} = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/auth/register — Daftarkan user baru
router.post('/register', register);

// POST /api/auth/login — Login & dapatkan token JWT
router.post('/login', login);

// POST /api/auth/logout — Logout (dilindungi token)
router.post('/logout', verifyToken, logout);

// POST /api/auth/verify-reset-identity — Verifikasi data internal staf (Username/ID & PIN)
router.post('/verify-reset-identity', verifyResetIdentity);

// POST /api/auth/reset-password — Input kata sandi baru & update langsung di DB
router.post('/reset-password', resetPasswordDirect);

module.exports = router;
