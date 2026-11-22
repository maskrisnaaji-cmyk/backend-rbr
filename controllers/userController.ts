import { Request, Response } from 'express';
import {
  getAllMembers,
  getUserById,
  updateUserVerification,
  deleteUserById,
} from '../models/userModel';

/**
 * GET /api/users & GET /api/members
 * Mengambil daftar user (role = 'user') beserta total riwayat aktivitasnya
 * (gabungan pesanan kedai, tiket acara budaya, dan peminjaman buku sebagai visit_count).
 */
export async function getUsers(req: Request, res: Response) {
  try {
    const rows: any[] = await getAllMembers();
    const members = rows.map((u: any) => {
      const visitCount = Number(u.visit_count) || 0;
      const isVerified = u.is_verified === 1 || u.is_verified === true || u.is_verified === '1';
      return {
        id: Number(u.id),
        name: u.name,
        email: u.email,
        phone: u.phone || null,
        role: u.role === 'admin' ? 'Admin' : (visitCount >= 20 ? 'Member VIP' : 'Member Reguler'),
        raw_role: u.role,
        is_verified: isVerified ? 1 : 0,
        status: isVerified ? 'Terverifikasi' : 'Menunggu Verifikasi',
        visit_count: visitCount,
        visits: `${visitCount}x Kunjungan`,
        createdAt: u.createdAt,
      };
    });

    res.json(members);
  } catch (err: any) {
    console.error('[getUsers]', err);
    res.status(500).json({ message: 'Gagal mengambil data anggota/pengguna.' });
  }
}

/**
 * PATCH /api/users/:id/verify & PATCH /api/members/:id/verify
 * Mengubah status is_verified (true/false) untuk akun user.
 */
export async function verifyUser(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const { is_verified } = req.body;

    const userRows = await getUserById(id);
    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }

    let newStatus: number;
    if (is_verified !== undefined) {
      newStatus = (is_verified === true || is_verified === 1 || String(is_verified) === '1' || String(is_verified) === 'true') ? 1 : 0;
    } else {
      const current = userRows[0].is_verified;
      newStatus = (current === 1 || current === true || Number(current) === 1) ? 0 : 1;
    }

    await updateUserVerification(id, newStatus);

    res.json({
      success: true,
      message: `Status verifikasi pengguna berhasil diubah menjadi ${newStatus === 1 ? 'Terverifikasi' : 'Menunggu Verifikasi'}.`,
      data: {
        id: Number(id),
        is_verified: newStatus,
        status: newStatus === 1 ? 'Terverifikasi' : 'Menunggu Verifikasi',
      },
    });
  } catch (err: any) {
    console.error('[verifyUser]', err);
    res.status(500).json({ message: 'Gagal memperbarui status verifikasi pengguna.' });
  }
}

/**
 * DELETE /api/users/:id & DELETE /api/members/:id
 * Menghapus akun user berdasarkan id.
 */
export async function deleteUser(req: Request, res: Response) {
  try {
    const id = String(req.params.id);
    const userRows = await getUserById(id);
    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
    }

    await deleteUserById(id);
    res.json({
      success: true,
      message: 'Akun pengguna berhasil dihapus.',
    });
  } catch (err: any) {
    console.error('[deleteUser]', err);
    res.status(500).json({ message: 'Gagal menghapus akun pengguna.' });
  }
}

module.exports = {
  getUsers,
  verifyUser,
  deleteUser,
};
