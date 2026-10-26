const pool = require('../config/db');

// GET /api/events — Ambil semua agenda/event
const getAllEvents = async (req, res) => {
  try {
    const { month, date } = req.query;
    let query = 'SELECT id, tittle, tittle AS title, date, time, location, price, quota, sold, status, image, category FROM events';
    const params = [];

    if (date) {
      query += ' WHERE date LIKE ?';
      params.push(`%${date}%`);
    } else if (month) {
      query += ' WHERE date LIKE ?';
      params.push(`%${month}%`);
    }

    query += ' ORDER BY date ASC, id ASC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[getAllEvents]', err);
    res.status(500).json({ message: 'Gagal mengambil data event/agenda.' });
  }
};

// GET /api/events/:id — Ambil satu event
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT id, tittle, tittle AS title, date, time, location, price, quota, sold, status, image, category FROM events WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[getEventById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail event.' });
  }
};

// POST /api/events — Tambah event baru
const createEvent = async (req, res) => {
  try {
    const { title, tittle, date, time, location, price, quota, sold, status, image, category } = req.body;
    const eventTitle = title || tittle;

    if (!eventTitle) {
      return res.status(400).json({ message: 'Judul event wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO events (tittle, date, time, location, price, quota, sold, status, image, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        eventTitle,
        date || '',
        time || '',
        location || 'Pendopo Utama RBR',
        price !== undefined ? Number(price) : 0,
        quota !== undefined ? Number(quota) : 50,
        sold !== undefined ? Number(sold) : 0,
        status || 'Aktif',
        image || '',
        category || 'Budaya',
      ]
    );

    const [created] = await pool.execute(
      'SELECT id, tittle, tittle AS title, date, time, location, price, quota, sold, status, image, category FROM events WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({ message: 'Event berhasil ditambahkan.', data: created[0] });
  } catch (err) {
    console.error('[createEvent]', err);
    res.status(500).json({ message: 'Gagal menambahkan event.' });
  }
};

// PUT /api/events/:id — Perbarui event
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, tittle, date, time, location, price, quota, sold, status, image, category } = req.body;
    const eventTitle = title || tittle;

    const [existing] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    const current = existing[0];
    await pool.execute(
      'UPDATE events SET tittle = ?, date = ?, time = ?, location = ?, price = ?, quota = ?, sold = ?, status = ?, image = ?, category = ? WHERE id = ?',
      [
        eventTitle !== undefined ? eventTitle : current.tittle,
        date !== undefined ? date : current.date,
        time !== undefined ? time : current.time,
        location !== undefined ? location : current.location,
        price !== undefined ? Number(price) : current.price,
        quota !== undefined ? Number(quota) : current.quota,
        sold !== undefined ? Number(sold) : current.sold,
        status !== undefined ? status : current.status,
        image !== undefined ? image : current.image,
        category !== undefined ? category : current.category,
        id,
      ]
    );

    const [updated] = await pool.execute(
      'SELECT id, tittle, tittle AS title, date, time, location, price, quota, sold, status, image, category FROM events WHERE id = ?',
      [id]
    );
    res.json({ message: 'Event berhasil diperbarui.', data: updated[0] });
  } catch (err) {
    console.error('[updateEvent]', err);
    res.status(500).json({ message: 'Gagal memperbarui event.' });
  }
};

// DELETE /api/events/:id — Hapus event
const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    res.json({ message: 'Event berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteEvent]', err);
    res.status(500).json({ message: 'Gagal menghapus event.' });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
};
