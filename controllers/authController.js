const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * POST /api/auth/register
 * Mendaftarkan user baru dengan password yang di-hash
 */
const register = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, dan password wajib diisi.' });
    }

    // Cek apakah email sudah terdaftar
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email sudah terdaftar.' });
    }

    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Hanya izinkan role 'admin' atau 'user', default ke 'user'
    const userRole = role === 'admin' ? 'admin' : 'user';

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone || null, hashedPassword, userRole]
    );

    // Generate token JWT
    const token = jwt.sign(
      { id: result.insertId, name, email, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'Registrasi berhasil.',
      token,
      user: { id: result.insertId, name, email, phone: phone || null, role: userRole },
    });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/auth/login
 * Login dengan email & password, kembalikan JWT + data user
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi.' });
    }

    // Cari user berdasarkan email
    const [rows] = await pool.execute(
      'SELECT id, name, email, password, role FROM users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user = rows[0];

    // Verifikasi password dengan bcrypt.compare
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    // Buat token JWT (berlaku 24 jam)
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Login berhasil.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

/**
 * POST /api/auth/logout
 * Logout — invalidasi token dilakukan di sisi client
 */
const logout = (req, res) => {
  return res.status(200).json({
    message: 'Logout berhasil. Silakan hapus token di sisi client.',
  });
};

/**
 * POST /api/auth/verify-reset-identity
 * Verifikasi data internal (Username/Email/ID Staf & PIN Keamanan Khusus)
 */
const verifyResetIdentity = async (req, res) => {
  try {
    const { identifier, securityPin } = req.body;

    if (!identifier || !securityPin) {
      return res.status(400).json({ 
        message: 'Username/Email/ID Staf dan Kode PIN Keamanan wajib diisi.' 
      });
    }

    const trimmedIdentifier = identifier.trim();
    const trimmedPin = securityPin.trim();

    // Cari user berdasarkan email, nama, atau id
    const [rows] = await pool.execute(
      'SELECT id, name, email, role, security_pin FROM users WHERE email = ? OR name = ? OR id = ?',
      [trimmedIdentifier, trimmedIdentifier, trimmedIdentifier]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Akun staf/admin tidak ditemukan. Pastikan data identitas benar.' 
      });
    }

    const user = rows[0];

    // Cek kecocokan PIN Keamanan Khusus:
    // 1. PIN yang tersimpan di database user (default: RBR2026)
    // 2. PIN dari environment variable INTERNAL_SECURITY_PIN
    // 3. Fallback PIN resmi internal ('RBR2026', '123456', 'admin123', '888888')
    const allowedPins = [
      user.security_pin,
      process.env.INTERNAL_SECURITY_PIN,
      'RBR2026',
      '123456',
      'admin123',
      '888888',
    ].filter(Boolean);

    if (!allowedPins.includes(trimmedPin)) {
      return res.status(401).json({ 
        message: 'Kode PIN Keamanan internal salah atau tidak valid.' 
      });
    }

    // Buat token verifikasi sementara (berlaku 15 menit)
    const resetToken = jwt.sign(
      { id: user.id, email: user.email, purpose: 'reset-password' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      message: 'Verifikasi identitas staf berhasil.',
      verified: true,
      resetToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[verifyResetIdentity]', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server saat verifikasi identitas.' });
  }
};

/**
 * POST /api/auth/reset-password
 * Memperbarui kata sandi langsung di database setelah verifikasi
 */
const resetPasswordDirect = async (req, res) => {
  try {
    const { userId, resetToken, newPassword, identifier, securityPin } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'Kata sandi baru wajib diisi minimal 6 karakter.' 
      });
    }

    let targetUserId = userId;

    if (resetToken) {
      try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        if (decoded.purpose !== 'reset-password') {
          return res.status(401).json({ message: 'Token reset tidak valid.' });
        }
        targetUserId = decoded.id;
      } catch (tokenErr) {
        return res.status(401).json({ message: 'Sesi verifikasi kadaluarsa. Silakan verifikasi ulang.' });
      }
    } else if (identifier && securityPin) {
      // Verifikasi langsung tanpa token jika disediakan identifier + securityPin
      const trimmedIdentifier = identifier.trim();
      const trimmedPin = securityPin.trim();

      const [rows] = await pool.execute(
        'SELECT id, security_pin FROM users WHERE email = ? OR name = ? OR id = ?',
        [trimmedIdentifier, trimmedIdentifier, trimmedIdentifier]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Akun staf/admin tidak ditemukan.' });
      }

      const user = rows[0];
      const allowedPins = [
        user.security_pin,
        process.env.INTERNAL_SECURITY_PIN,
        'RBR2026',
        '123456',
        'admin123',
        '888888',
      ].filter(Boolean);

      if (!allowedPins.includes(trimmedPin)) {
        return res.status(401).json({ message: 'Kode PIN Keamanan internal salah.' });
      }
      targetUserId = user.id;
    } else if (!targetUserId) {
      return res.status(400).json({ message: 'Data otentikasi reset tidak lengkap.' });
    }

    // Hash password baru dengan bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password langsung di database
    const [result] = await pool.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, targetUserId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan untuk memperbarui kata sandi.' });
    }

    return res.status(200).json({
      message: 'Kata sandi berhasil diperbarui langsung di database.',
      success: true,
    });
  } catch (err) {
    console.error('[resetPasswordDirect]', err);
    return res.status(500).json({ message: 'Terjadi kesalahan server saat memperbarui kata sandi.' });
  }
};

module.exports = { register, login, logout, verifyResetIdentity, resetPasswordDirect };
