const pool = require('../config/db');

// GET /api/menus — Ambil semua menu kedai
const getAllMenus = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM menus ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error('[getAllMenus]', err);
    res.status(500).json({ message: 'Gagal mengambil data menu.' });
  }
};

// GET /api/menus/:id — Ambil satu menu
const getMenuById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[getMenuById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail menu.' });
  }
};

// POST /api/menus — Tambah menu baru
const createMenu = async (req, res) => {
  try {
    const { name, category, price, description, image, status } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: 'Nama dan harga menu wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO menus (name, category, price, description, image, status) VALUES (?, ?, ?, ?, ?, ?)',
      [
        name,
        category || 'Kopi Nusantara',
        Number(price) || 0,
        description || '',
        image || '',
        status || 'Tersedia',
      ]
    );

    const [created] = await pool.execute('SELECT * FROM menus WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Menu berhasil ditambahkan.', data: created[0] });
  } catch (err) {
    console.error('[createMenu]', err);
    res.status(500).json({ message: 'Gagal menambahkan menu.' });
  }
};

// PUT /api/menus/:id — Perbarui menu
const updateMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, description, image, status } = req.body;

    const [existing] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Menu tidak ditemukan.' });
    }

    const current = existing[0];
    await pool.execute(
      'UPDATE menus SET name = ?, category = ?, price = ?, description = ?, image = ?, status = ? WHERE id = ?',
      [
        name !== undefined ? name : current.name,
        category !== undefined ? category : current.category,
        price !== undefined ? Number(price) : current.price,
        description !== undefined ? description : current.description,
        image !== undefined ? image : current.image,
        status !== undefined ? status : current.status,
        id,
      ]
    );

    const [updated] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
    res.json({ message: 'Menu berhasil diperbarui.', data: updated[0] });
  } catch (err) {
    console.error('[updateMenu]', err);
    res.status(500).json({ message: 'Gagal memperbarui menu.' });
  }
};

// DELETE /api/menus/:id — Hapus menu
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
  getAllMenus,
  getMenuById,
  createMenu,
  updateMenu,
  deleteMenu,
};
