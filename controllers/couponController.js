const pool = require('../config/db');

async function getAllCoupons(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, code, description AS desc, status, theme, created_at FROM coupons ORDER BY id ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('[getAllCoupons]', err);
    res.status(500).json({ message: 'Gagal mengambil data kupon.' });
  }
}

async function createCoupon(req, res) {
  try {
    const { code, desc, status, theme } = req.body;
    const normalizedCode = String(code || '').trim().toUpperCase();
    const description = String(desc || '').trim();

    if (!normalizedCode || !description) {
      return res.status(400).json({ message: 'Kode dan deskripsi kupon wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO coupons (code, description, status, theme) VALUES (?, ?, ?, ?)',
      [normalizedCode, description, status || 'Aktif', theme || 'maroon']
    );
    const [rows] = await pool.execute(
      'SELECT id, code, description AS desc, status, theme, created_at FROM coupons WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Kode kupon sudah digunakan.' });
    }
    console.error('[createCoupon]', err);
    res.status(500).json({ message: 'Gagal menambahkan kupon.' });
  }
}

async function deleteCoupon(req, res) {
  try {
    const [result] = await pool.execute('DELETE FROM coupons WHERE id = ?', [req.params.id]);
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
