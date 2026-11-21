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
    const {
      code,
      desc,
      description: rawDesc,
      discount_type,
      discount_value,
      target_member,
      is_active,
      status,
      theme,
    } = req.body;

    const normalizedCode = String(code || '').trim().toUpperCase();
    const finalDesc = String(desc || rawDesc || '').trim();

    if (!normalizedCode || !finalDesc) {
      return res.status(400).json({ message: 'Kode dan deskripsi kupon wajib diisi.' });
    }

    // Ekstraksi otomatis discount_type & discount_value jika form tidak mengirimnya secara eksplisit
    let dType = discount_type ? String(discount_type).toLowerCase() : '';
    let dVal = Number(discount_value) || 0;

    if (!dType || !dVal) {
      const percentMatch = finalDesc.match(/(\d+)\s*%/);
      const fixedMatch = finalDesc.match(/Rp\s*([\d.]+)/i);
      if (percentMatch) {
        dType = 'percent';
        dVal = parseInt(percentMatch[1], 10);
      } else if (fixedMatch) {
        dType = 'fixed';
        dVal = parseInt(fixedMatch[1].replace(/\./g, ''), 10);
      } else {
        dType = dType || 'percent';
        dVal = dVal || 10;
      }
    }

    const target = target_member === 'verified' ? 'verified' : 'all';
    const active = is_active !== undefined ? (is_active ? 1 : 0) : (status === 'Nonaktif' ? 0 : 1);
    const statusVal = active ? 'Aktif' : 'Nonaktif';
    const themeVal = theme || (dType === 'fixed' ? 'amber' : 'maroon');

    const result = await createCouponModel(
      normalizedCode,
      finalDesc,
      dType,
      dVal,
      target,
      active,
      statusVal,
      themeVal
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
