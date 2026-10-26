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

module.exports = { register, login, logout };
