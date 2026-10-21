const express = require('express');
const router = express.Router();
const { register, login, logout } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/auth/register — Daftarkan user baru
router.post('/register', register);

// POST /api/auth/login — Login & dapatkan token JWT
router.post('/login', login);

// POST /api/auth/logout — Logout (dilindungi token)
router.post('/logout', verifyToken, logout);

module.exports = router;
