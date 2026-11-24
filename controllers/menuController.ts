import { Request, Response } from 'express';
import pool from '../config/db';
import {
  getAllMenusQuery,
  getMenuById as getMenuByIdModel,
  insertMenuWithAvailability,
  insertMenuWithoutAvailability,
  updateMenuWithAvailability,
  updateMenuWithoutAvailability,
  patchMenuStatusWithAvailability,
  patchMenuStatusWithoutAvailability,
  deleteMenu as deleteMenuModel,
} from '../models/menuModel';

// Helper formatting row menu agar konsisten memiliki boolean is_available
export const formatMenuRow = (row: any) => {
  let isAvailable = true;
  if (row.is_available !== undefined && row.is_available !== null) {
    isAvailable = row.is_available === 1 || row.is_available === true || row.is_available === '1' || row.is_available === 'true';
  } else if (row.status !== undefined && row.status !== null) {
    isAvailable = String(row.status).trim().toLowerCase() !== 'habis';
  }
  const status = isAvailable ? 'Tersedia' : 'Habis';

  return {
    ...row,
    price: Number(row.price) || 0,
    status,
    is_available: isAvailable,
  };
};

// GET /api/menus & /api/kedai/menus — Ambil semua menu kedai (tanpa menyembunyikan yang habis)
export const getAllMenus = async (req: Request, res: Response) => {
  try {
    const rawQ = (req.query.q || req.query.search) as string | undefined;
    const category = req.query.category as string | undefined;

    let sql = 'SELECT * FROM menus';
    const params: any[] = [];
    const conditions: string[] = [];

    if (rawQ && rawQ.trim().length > 0) {
      const keyword = `%${rawQ.trim()}%`;
      conditions.push('(name LIKE ? OR category LIKE ? OR description LIKE ?)');
      params.push(keyword, keyword, keyword);
    }

    if (category && category !== 'Semua') {
      conditions.push('category = ?');
      params.push(category);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY id ASC';

    const rows = await getAllMenusQuery(sql, params);
    const formatted = rows.map(formatMenuRow);
    res.json(formatted);
  } catch (err) {
    console.error('[getAllMenus]', err);
    res.status(500).json({ message: 'Gagal mengambil data menu.' });
  }
};

// GET /api/menus/:id & /api/kedai/menus/:id — Ambil satu menu
export const getMenuById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await getMenuByIdModel(id);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }
    res.json(formatMenuRow(rows[0]));
  } catch (err) {
    console.error('[getMenuById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail menu.' });
  }
};

// POST /api/menus & /api/kedai/menus — Tambah menu baru
export const createMenu = async (req: Request, res: Response) => {
  try {
    const { name, category, price, description, image, status, is_available } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: 'Nama dan harga menu wajib diisi.' });
    }

    let availableBool = true;
    if (is_available !== undefined) {
      availableBool = is_available === true || is_available === 1 || is_available === '1' || is_available === 'true';
    } else if (status !== undefined) {
      availableBool = String(status).trim().toLowerCase() !== 'habis';
    }
    const finalStatus = availableBool ? 'Tersedia' : 'Habis';

    let result: any;
    try {
      result = await insertMenuWithAvailability(
        name,
        category || 'Kopi Nusantara',
        Number(price) || 0,
        description || '',
        image || '',
        finalStatus,
        availableBool ? 1 : 0
      );
    } catch (dbErr: any) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        result = await insertMenuWithoutAvailability(
          name,
          category || 'Kopi Nusantara',
          Number(price) || 0,
          description || '',
          image || '',
          finalStatus
        );
      } else {
        throw dbErr;
      }
    }

    const created = await getMenuByIdModel(result.insertId);
    const formatted = formatMenuRow(created[0]);
    res.status(201).json({
      message: 'Menu berhasil ditambahkan.',
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error('[createMenu]', err);
    res.status(500).json({ message: 'Gagal menambahkan menu.' });
  }
};

// PUT /api/menus/:id & /api/kedai/menus/:id — Perbarui menu
export const updateMenu = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category, price, description, image, status, is_available } = req.body;

    const existing = await getMenuByIdModel(id);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }

    const current: any = existing[0];
    const currentAvailable = current.is_available !== undefined && current.is_available !== null
      ? (current.is_available === 1 || current.is_available === true || current.is_available === '1' || current.is_available === 'true')
      : (String(current.status).trim().toLowerCase() !== 'habis');

    let nextAvailable: boolean;
    let nextStatus: string;

    if (is_available !== undefined) {
      nextAvailable = is_available === true || is_available === 1 || is_available === '1' || is_available === 'true';
      nextStatus = nextAvailable ? 'Tersedia' : 'Habis';
    } else if (status !== undefined) {
      nextStatus = String(status).trim() === 'Habis' ? 'Habis' : 'Tersedia';
      nextAvailable = nextStatus === 'Tersedia';
    } else {
      nextAvailable = currentAvailable;
      nextStatus = current.status || (nextAvailable ? 'Tersedia' : 'Habis');
    }

    try {
      await updateMenuWithAvailability(
        name !== undefined ? name : current.name,
        category !== undefined ? category : current.category,
        price !== undefined ? Number(price) : current.price,
        description !== undefined ? description : current.description,
        image !== undefined ? image : current.image,
        nextStatus,
        nextAvailable ? 1 : 0,
        id
      );
    } catch (dbErr: any) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        await updateMenuWithoutAvailability(
          name !== undefined ? name : current.name,
          category !== undefined ? category : current.category,
          price !== undefined ? Number(price) : current.price,
          description !== undefined ? description : current.description,
          image !== undefined ? image : current.image,
          nextStatus,
          id
        );
      } else {
        throw dbErr;
      }
    }

    const updated = await getMenuByIdModel(id);
    const formatted = formatMenuRow(updated[0]);
    res.json({
      message: 'Menu berhasil diperbarui.',
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error('[updateMenu]', err);
    res.status(500).json({ message: 'Gagal memperbarui menu.' });
  }
};

// PATCH /api/kedai/menus/:id & /api/menus/:id — Mengubah status ketersediaan menu (Tersedia / Habis)
export const patchMenuStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_available, status } = req.body || {};

    const existing = await getMenuByIdModel(id);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan.' });
    }

    const current: any = existing[0];
    const currentAvailable = current.is_available !== undefined && current.is_available !== null
      ? (current.is_available === 1 || current.is_available === true || current.is_available === '1' || current.is_available === 'true')
      : (String(current.status).trim().toLowerCase() !== 'habis');

    let nextAvailable: boolean;
    let nextStatus: string;

    if (is_available !== undefined) {
      nextAvailable = is_available === true || is_available === 1 || is_available === '1' || is_available === 'true';
      nextStatus = nextAvailable ? 'Tersedia' : 'Habis';
    } else if (status !== undefined) {
      nextStatus = String(status).trim() === 'Habis' ? 'Habis' : 'Tersedia';
      nextAvailable = nextStatus === 'Tersedia';
    } else {
      // Toggle bila tidak ada parameter yang dikirim
      nextAvailable = !currentAvailable;
      nextStatus = nextAvailable ? 'Tersedia' : 'Habis';
    }

    try {
      await patchMenuStatusWithAvailability(nextAvailable ? 1 : 0, nextStatus, id);
    } catch (dbErr: any) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        await patchMenuStatusWithoutAvailability(nextStatus, id);
      } else {
        throw dbErr;
      }
    }

    const updated = await getMenuByIdModel(id);
    const formatted = formatMenuRow(updated[0]);

    res.json({
      success: true,
      message: `Status menu berhasil diubah menjadi ${nextStatus}.`,
      data: formatted,
      ...formatted,
    });
  } catch (err) {
    console.error('[patchMenuStatus]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status ketersediaan menu.' });
  }
};

// DELETE /api/menus/:id & /api/kedai/menus/:id — Hapus menu
export const deleteMenu = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await deleteMenuModel(id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }
    res.json({ message: 'Menu berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteMenu]', err);
    res.status(500).json({ message: 'Gagal menghapus menu.' });
  }
};

