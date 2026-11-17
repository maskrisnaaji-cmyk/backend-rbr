const pool = require('../config/db');

// Helper formatting row menu agar konsisten memiliki boolean is_available
const formatMenuRow = (row) => {
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
const getAllMenus = async (req, res) => {
  try {
    const rawQ = req.query.q || req.query.search;
    const category = req.query.category;

    let sql = 'SELECT * FROM menus';
    const params = [];
    const conditions = [];

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

    const [rows] = await pool.query(sql, params);
    const formatted = rows.map(formatMenuRow);
    res.json(formatted);
  } catch (err) {
    console.error('[getAllMenus]', err);
    res.status(500).json({ message: 'Gagal mengambil data menu.' });
  }
};

// GET /api/menus/:id & /api/kedai/menus/:id — Ambil satu menu
const getMenuById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }
    res.json(formatMenuRow(rows[0]));
  } catch (err) {
    console.error('[getMenuById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail menu.' });
  }
};

// POST /api/menus & /api/kedai/menus — Tambah menu baru
const createMenu = async (req, res) => {
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

    let result;
    try {
      const [insertRes] = await pool.execute(
        'INSERT INTO menus (name, category, price, description, image, status, is_available) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          name,
          category || 'Kopi Nusantara',
          Number(price) || 0,
          description || '',
          image || '',
          finalStatus,
          availableBool ? 1 : 0,
        ]
      );
      result = insertRes;
    } catch (dbErr) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        try {
          await pool.query('ALTER TABLE menus ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT TRUE');
          const [insertRes] = await pool.execute(
            'INSERT INTO menus (name, category, price, description, image, status, is_available) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              name,
              category || 'Kopi Nusantara',
              Number(price) || 0,
              description || '',
              image || '',
              finalStatus,
              availableBool ? 1 : 0,
            ]
          );
          result = insertRes;
        } catch (_) {
          const [insertRes] = await pool.execute(
            'INSERT INTO menus (name, category, price, description, image, status) VALUES (?, ?, ?, ?, ?, ?)',
            [
              name,
              category || 'Kopi Nusantara',
              Number(price) || 0,
              description || '',
              image || '',
              finalStatus,
            ]
          );
          result = insertRes;
        }
      } else {
        throw dbErr;
      }
    }

    const [created] = await pool.execute('SELECT * FROM menus WHERE id = ?', [result.insertId]);
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
const updateMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, description, image, status, is_available } = req.body;

    const [existing] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }

    const current = existing[0];
    const currentAvailable = current.is_available !== undefined && current.is_available !== null
      ? (current.is_available === 1 || current.is_available === true || current.is_available === '1' || current.is_available === 'true')
      : (String(current.status).trim().toLowerCase() !== 'habis');

    let nextAvailable = currentAvailable;
    let nextStatus = current.status || 'Tersedia';

    if (is_available !== undefined) {
      nextAvailable = is_available === true || is_available === 1 || is_available === '1' || is_available === 'true';
      nextStatus = nextAvailable ? 'Tersedia' : 'Habis';
    } else if (status !== undefined) {
      nextStatus = String(status).trim() === 'Habis' ? 'Habis' : 'Tersedia';
      nextAvailable = nextStatus === 'Tersedia';
    }

    try {
      await pool.execute(
        'UPDATE menus SET name = ?, category = ?, price = ?, description = ?, image = ?, status = ?, is_available = ? WHERE id = ?',
        [
          name !== undefined ? name : current.name,
          category !== undefined ? category : current.category,
          price !== undefined ? Number(price) : current.price,
          description !== undefined ? description : current.description,
          image !== undefined ? image : current.image,
          nextStatus,
          nextAvailable ? 1 : 0,
          id,
        ]
      );
    } catch (dbErr) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        try {
          await pool.query('ALTER TABLE menus ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT TRUE');
          await pool.execute(
            'UPDATE menus SET name = ?, category = ?, price = ?, description = ?, image = ?, status = ?, is_available = ? WHERE id = ?',
            [
              name !== undefined ? name : current.name,
              category !== undefined ? category : current.category,
              price !== undefined ? Number(price) : current.price,
              description !== undefined ? description : current.description,
              image !== undefined ? image : current.image,
              nextStatus,
              nextAvailable ? 1 : 0,
              id,
            ]
          );
        } catch (_) {
          await pool.execute(
            'UPDATE menus SET name = ?, category = ?, price = ?, description = ?, image = ?, status = ? WHERE id = ?',
            [
              name !== undefined ? name : current.name,
              category !== undefined ? category : current.category,
              price !== undefined ? Number(price) : current.price,
              description !== undefined ? description : current.description,
              image !== undefined ? image : current.image,
              nextStatus,
              id,
            ]
          );
        }
      } else {
        throw dbErr;
      }
    }

    const [updated] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
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
const patchMenuStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available, status } = req.body || {};

    const [existing] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan.' });
    }

    const current = existing[0];
    const currentAvailable = current.is_available !== undefined && current.is_available !== null
      ? (current.is_available === 1 || current.is_available === true || current.is_available === '1' || current.is_available === 'true')
      : (String(current.status).trim().toLowerCase() !== 'habis');

    let nextAvailable;
    let nextStatus;

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
      await pool.execute(
        'UPDATE menus SET is_available = ?, status = ? WHERE id = ?',
        [nextAvailable ? 1 : 0, nextStatus, id]
      );
    } catch (dbErr) {
      if (dbErr.code === 'ER_BAD_FIELD_ERROR') {
        try {
          await pool.query('ALTER TABLE menus ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT TRUE');
          await pool.execute(
            'UPDATE menus SET is_available = ?, status = ? WHERE id = ?',
            [nextAvailable ? 1 : 0, nextStatus, id]
          );
        } catch (_) {
          await pool.execute('UPDATE menus SET status = ? WHERE id = ?', [nextStatus, id]);
        }
      } else {
        throw dbErr;
      }
    }

    const [updated] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
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
const deleteMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM menus WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }
    res.json({ message: 'Menu berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteMenu]', err);
    res.status(500).json({ message: 'Gagal menghapus menu.' });
  }
};

module.exports = {
  formatMenuRow,
  getAllMenus,
  getMenuById,
  createMenu,
  updateMenu,
  patchMenuStatus,
  deleteMenu,
};
