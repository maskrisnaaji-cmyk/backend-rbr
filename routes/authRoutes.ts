import express from 'express';
import { 
  register, 
  login, 
  logout, 
  verifyResetIdentity, 
  resetPasswordDirect,
  forgotPassword,
  googleLogin,
} from '../controllers/authController';
import { verifyToken } from '../middleware/authMiddleware';

const router = express.Router();

// POST /api/auth/register — Daftarkan user baru
router.post('/register', register);

// POST /api/auth/login — Login & dapatkan token JWT
router.post('/login', login);

// POST /api/auth/google-login — Login atau auto-register dengan Google
router.post('/google-login', googleLogin);

// POST /api/auth/logout — Logout (dilindungi token)
router.post('/logout', verifyToken, logout);

// POST /api/auth/forgot-password — Cek keberadaan akun & kirim instruksi atur ulang kata sandi
router.post('/forgot-password', forgotPassword);

// POST /api/auth/verify-reset-identity — Verifikasi data internal staf (Username/ID & PIN)
router.post('/verify-reset-identity', verifyResetIdentity);

// POST /api/auth/reset-password — Input kata sandi baru & update langsung di DB
router.post('/reset-password', resetPasswordDirect);

export default router;
module.exports = router;

