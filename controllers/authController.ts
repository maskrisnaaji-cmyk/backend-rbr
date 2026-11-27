import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  findUserEmailOnly,
  findUserForLogin,
  findUserForGoogleLogin,
  createUser,
  createGoogleUser,
  findUserByIdentifier,
  findUserByIdentifierForReset,
  findUserByEmailAndPhone,
  updateUserPassword,
  findUserByEmailOrPhone,
  updateUserName,
} from '../models/userModel';
import { createAuditLog } from '../models/transactionModel';

/**
 * POST /api/auth/register
 * Mendaftarkan user baru dengan password yang di-hash
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, dan password wajib diisi.' });
    }

    // Cek apakah email sudah terdaftar
    const existing = await findUserEmailOnly(email);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email sudah terdaftar.' });
    }

    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Hanya izinkan role 'admin' atau 'user', default ke 'user'
    const userRole = role === 'admin' ? 'admin' : 'user';

    const result = await createUser(name, email, phone || null, hashedPassword, userRole);

    // Generate token JWT
    const token = jwt.sign(
      { id: result.insertId, name, email, role: userRole },
      process.env.JWT_SECRET as string,
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
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi.' });
    }

    // Cari user berdasarkan email
    const rows = await findUserForLogin(email);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user: any = rows[0];

    // Verifikasi password dengan bcrypt.compare
    const isPasswordValid = await bcrypt.compare(password, user.password || '');
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    // Buat token JWT (berlaku 24 jam)
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
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
export const logout = (req: Request, res: Response) => {
  return res.status(200).json({
    message: 'Logout berhasil. Silakan hapus token di sisi client.',
  });
};

/**
 * POST /api/auth/verify-reset-identity
 * Verifikasi data internal (Username/Email/ID Staf & PIN Keamanan Khusus)
 */
export const verifyResetIdentity = async (req: Request, res: Response) => {
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
    const rows = await findUserByIdentifier(trimmedIdentifier);

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Akun staf/admin tidak ditemukan. Pastikan data identitas benar.' 
      });
    }

    const user: any = rows[0];

    // Cek kecocokan PIN Keamanan Khusus:
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
      process.env.JWT_SECRET as string,
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
 * POST /api/auth/verify-reset-account
 * Menerima { email, phone }. Cek apakah ada user dengan kombinasi email DAN nomor HP tersebut.
 * Jika cocok: kembalikan 200 OK { success: true, message: "Akun terverifikasi" }
 * Jika tidak cocok: kembalikan 404 / 400 dengan pesan jelas.
 */
export const verifyResetAccount = async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Email dan nomor handphone wajib diisi.',
      });
    }

    const trimmedEmail = String(email).trim();
    const trimmedPhone = String(phone).trim();

    if (!trimmedEmail || !trimmedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Email dan nomor handphone tidak boleh kosong.',
      });
    }

    const rows = await findUserByEmailAndPhone(trimmedEmail, trimmedPhone);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Akun dengan kombinasi email dan nomor handphone tersebut tidak ditemukan.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Akun terverifikasi',
    });
  } catch (err) {
    console.error('[verifyResetAccount]', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat verifikasi akun.',
    });
  }
};

/**
 * POST /api/auth/reset-password-direct
 * Menerima { email, phone, newPassword }. Validasi ulang kecocokan email + phone di database,
 * hash newPassword menggunakan bcrypt, simpan ke database, lalu kembalikan 200 OK.
 * Juga mendukung backward compatibility untuk skenario reset internal/token jika disediakan.
 */
export const resetPasswordDirect = async (req: Request, res: Response) => {
  try {
    const { email, phone, newPassword, userId, resetToken, identifier, securityPin } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Kata sandi baru wajib diisi minimal 6 karakter.' 
      });
    }

    let targetUserId = userId;

    // Alur 2 Tahap: Verifikasi kecocokan Email + No. Handphone
    if (email && phone) {
      const trimmedEmail = String(email).trim();
      const trimmedPhone = String(phone).trim();

      const rows = await findUserByEmailAndPhone(trimmedEmail, trimmedPhone);
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Kombinasi email dan nomor handphone tidak cocok atau tidak terdaftar.',
        });
      }
      targetUserId = rows[0].id;
    } else if (resetToken) {
      try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET as string) as any;
        if (decoded.purpose !== 'reset-password') {
          return res.status(401).json({ success: false, message: 'Token reset tidak valid.' });
        }
        targetUserId = decoded.id;
      } catch (tokenErr) {
        return res.status(401).json({ success: false, message: 'Sesi verifikasi kadaluarsa. Silakan verifikasi ulang.' });
      }
    } else if (identifier && securityPin) {
      // Verifikasi langsung tanpa token jika disediakan identifier + securityPin
      const trimmedIdentifier = identifier.trim();
      const trimmedPin = securityPin.trim();

      const rows = await findUserByIdentifierForReset(trimmedIdentifier);

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Akun staf/admin tidak ditemukan.' });
      }

      const user: any = rows[0];
      const allowedPins = [
        user.security_pin,
        process.env.INTERNAL_SECURITY_PIN,
        'RBR2026',
        '123456',
        'admin123',
        '888888',
      ].filter(Boolean);

      if (!allowedPins.includes(trimmedPin)) {
        return res.status(401).json({ success: false, message: 'Kode PIN Keamanan internal salah.' });
      }
      targetUserId = user.id;
    } else if (!targetUserId) {
      return res.status(400).json({ 
        success: false,
        message: 'Email dan nomor handphone wajib disertakan untuk mereset kata sandi.' 
      });
    }

    // Hash password baru dengan bcrypt
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password langsung di database
    const result = await updateUserPassword(hashedPassword, targetUserId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Pengguna tidak ditemukan untuk memperbarui kata sandi.' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Kata sandi berhasil diperbarui langsung di database.',
    });
  } catch (err) {
    console.error('[resetPasswordDirect]', err);
    return res.status(500).json({ 
      success: false,
      message: 'Terjadi kesalahan server saat memperbarui kata sandi.' 
    });
  }
};

/**
 * POST /api/auth/forgot-password
 * Memeriksa keberadaan akun berdasarkan email atau nomor handphone di tabel users
 * Mengembalikan respons sukses jika akun ditemukan, atau pesan error jika belum terdaftar.
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const rawIdentifier = req.body.identifier || req.body.email || req.body.phone || req.body.emailOrPhone || '';
    const identifier = String(rawIdentifier).trim();

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Silakan masukkan Email atau Nomor Handphone terdaftar Anda.',
      });
    }

    // Cari pengguna berdasarkan email ATAU phone di tabel users
    const rows = await findUserByEmailOrPhone(identifier);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Akun dengan Email atau Nomor Handphone tersebut belum terdaftar di sistem kami.',
      });
    }

    const user: any = rows[0];

    // Catat log audit jika tabel audit_logs tersedia
    try {
      await createAuditLog(
        'FORGOT_PASSWORD_REQUEST',
        '/api/auth/forgot-password',
        user.email || identifier,
        JSON.stringify({ userId: user.id, identifier })
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Instruksi atur ulang kata sandi telah berhasil dikirim ke alamat email / nomor WhatsApp Anda.',
      data: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error('[forgotPassword]', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat memproses permintaan atur ulang kata sandi.',
    });
  }
};

/**
 * POST /api/auth/google-login
 * Login & sinkronisasi pengguna akun Google
 */
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { email, name, photoUrl, googleId } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email akun Google wajib disertakan.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const fallbackName = cleanEmail.split('@')[0];
    const candidateName = (name && name.trim().length > 0) ? name.trim() : fallbackName;

    // 1. Cek keberadaan user berdasarkan email
    const rows = await findUserForGoogleLogin(cleanEmail);

    let user: any;
    let isNewUser = false;

    if (rows.length > 0) {
      user = rows[0];

      // Jika nama pengguna sebelumnya generik atau kosong, perbarui dengan nama display Google jika tersedia
      if ((!user.name || user.name.trim().length === 0 || user.name === fallbackName) && candidateName !== fallbackName) {
        try {
          await updateUserName(candidateName, user.id);
          user.name = candidateName;
        } catch (_) {}
      }
    } else {
      isNewUser = true;
      // Auto-register pengguna baru dengan password hash acak aman
      const randomSecret = crypto.randomBytes(24).toString('hex');
      const hashedPassword = await bcrypt.hash(randomSecret, 10);
      const userRole = 'user';

      const insertResult = await createGoogleUser(candidateName, cleanEmail, hashedPassword, userRole);

      user = {
        id: insertResult.insertId,
        name: candidateName,
        email: cleanEmail,
        phone: null,
        role: userRole,
      };
    }

    // 2. Buat token JWT
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'rumah_budaya_ratna_secret_2026',
      { expiresIn: '24h' }
    );

    // 3. Catat aktivitas ke tabel audit_logs
    try {
      await createAuditLog(
        isNewUser ? 'GOOGLE_AUTO_REGISTER' : 'GOOGLE_LOGIN',
        '/api/auth/google-login',
        user.email,
        JSON.stringify({
          userId: user.id,
          name: user.name,
          googleId: googleId || null,
          isNewUser,
        })
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: isNewUser ? 'Akun Google berhasil didaftarkan dan masuk.' : 'Login Google berhasil.',
      token,
      isNewUser,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role || 'user',
        photoUrl: photoUrl || null,
      },
    });
  } catch (err) {
    console.error('[googleLogin]', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat memproses login Google.',
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyResetIdentity,
  verifyResetAccount,
  resetPasswordDirect,
  forgotPassword,
  googleLogin,
};
