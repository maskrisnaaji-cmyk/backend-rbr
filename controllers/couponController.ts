import { Request, Response } from 'express';
import {
  getAllCoupons as getAllCouponsModel,
  createCoupon as createCouponModel,
  getCouponById,
  deleteCoupon as deleteCouponModel,
} from '../models/couponModel';

export async function getAllCoupons(req: Request, res: Response) {
  try {
    const rows = await getAllCouponsModel();
    res.json(rows);
  } catch (err) {
    console.error('[getAllCoupons]', err);
    res.status(500).json({ message: 'Gagal mengambil data kupon.' });
  }
}

export async function createCoupon(req: Request, res: Response) {
  try {
    const { code, desc, status, theme } = req.body;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const description = String(desc || '').trim();

    if (!normalizedCode || !description) {
      return res.status(400).json({ message: 'Kode dan deskripsi kupon wajib diisi.' });
    }

    const result = await createCouponModel(
      normalizedCode,
      description,
      status || 'Aktif',
      theme || 'maroon'
    );
    const rows = await getCouponById(result.insertId);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Kode kupon sudah digunakan.' });
    }
    console.error('[createCoupon]', err);
    res.status(500).json({ message: 'Gagal menambahkan kupon.' });
  }
}

export async function deleteCoupon(req: Request, res: Response) {
  try {
    const result = await deleteCouponModel(req.params.id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Kupon tidak ditemukan.' });
    }
    res.json({ message: 'Kupon berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteCoupon]', err);
    res.status(500).json({ message: 'Gagal menghapus kupon.' });
  }
}

module.exports = { getAllCoupons, createCoupon, deleteCoupon };
