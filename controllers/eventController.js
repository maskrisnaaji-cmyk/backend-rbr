'use strict';

const pool = require('../config/db');

// ─── Helper: pastikan kolom booked_count selalu tersedia di tabel events ──────
let isBookedCountEnsured = false;
async function ensureBookedCountColumn() {
  if (isBookedCountEnsured) return;
  try {
    await pool.query('ALTER TABLE events ADD COLUMN booked_count INT DEFAULT 0 AFTER sold');
    await pool.query('UPDATE events SET booked_count = COALESCE(sold, 0) WHERE booked_count = 0 OR booked_count IS NULL');
    isBookedCountEnsured = true;
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column')) {
      isBookedCountEnsured = true;
    }
  }
}

// ─── Helper: format satu row event menjadi response standar ──────────────────
function formatEventRow(r) {
  const quota = Number(r.quota) || 0;
  const bookedCount = Number(r.booked_count ?? r.sold ?? 0);
  const remainingTickets = Math.max(0, quota - bookedCount);

  // Status otomatis: Tiket Penuh jika booked_count >= quota (dan quota > 0)
  let status = r.status || 'Tiket Tersedia';
  if (quota > 0 && bookedCount >= quota) {
    status = 'Tiket Penuh';
  } else if (status !== 'Tiket Penuh' && status !== 'Tiket Tersedia') {
    // Normalisasi nilai legacy
    status = 'Tiket Tersedia';
  }

  return {
    id: r.id,
    title: r.title || '',
    tittle: r.title || '', // alias kompatibilitas
    date: r.date || '',
    time: r.time || '',
    location: r.location || '',
    price: Number(r.price) || 0,
    quota,
    sold: Number(r.sold) || 0,
    booked_count: bookedCount,
    remaining_tickets: remainingTickets,
    is_available: quota === 0 ? true : bookedCount < quota, // gratis/tanpa kuota selalu tersedia
    status,
    image: r.image || '',
    banner_image: r.banner_image || r.image || '',
    category: r.category || 'Budaya',
  };
}

// ─── Helper: sinkron status ke DB setelah perubahan booked_count ──────────────
async function syncEventStatus(pool, eventId) {
  await pool.execute(
    `UPDATE events
        SET status = CASE
          WHEN quota > 0 AND booked_count >= quota THEN 'Tiket Penuh'
          ELSE 'Tiket Tersedia'
        END
      WHERE id = ?`,
    [eventId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// GET /api/events – Ambil semua agenda/event
const getAllEvents = async (req, res) => {
  try {
    await ensureBookedCountColumn();

    const { month, date } = req.query;
    let query =
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events';
    const params = [];

    if (date) {
      query += ' WHERE date LIKE ?';
      params.push(`%${date}%`);
    } else if (month) {
      query += ' WHERE date LIKE ?';
      params.push(`%${month}%`);
    }

    query += ' ORDER BY date ASC, id ASC';

    let rows;
    try {
      [rows] = await pool.query(query, params);
    } catch (queryErr) {
      if (queryErr.code === 'ER_BAD_FIELD_ERROR' || queryErr.message?.includes('booked_count')) {
        await pool.query('ALTER TABLE events ADD COLUMN booked_count INT DEFAULT 0 AFTER sold');
        await pool.query('UPDATE events SET booked_count = COALESCE(sold, 0) WHERE booked_count = 0 OR booked_count IS NULL');
        [rows] = await pool.query(query, params);
      } else {
        throw queryErr;
      }
    }

    res.json(rows.map(formatEventRow));
  } catch (err) {
    console.error('[getAllEvents]', err);
    res.status(500).json({ message: 'Gagal mengambil data event/agenda.' });
  }
};

// GET /api/events/:id – Ambil satu event
const getEventById = async (req, res) => {
  try {
    await ensureBookedCountColumn();

    const { id } = req.params;
    let rows;
    const selectQuery =
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?';

    try {
      [rows] = await pool.execute(selectQuery, [id]);
    } catch (queryErr) {
      if (queryErr.code === 'ER_BAD_FIELD_ERROR' || queryErr.message?.includes('booked_count')) {
        await pool.query('ALTER TABLE events ADD COLUMN booked_count INT DEFAULT 0 AFTER sold');
        await pool.query('UPDATE events SET booked_count = COALESCE(sold, 0) WHERE booked_count = 0 OR booked_count IS NULL');
        [rows] = await pool.execute(selectQuery, [id]);
      } else {
        throw queryErr;
      }
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    res.json(formatEventRow(rows[0]));
  } catch (err) {
    console.error('[getEventById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail event.' });
  }
};

// POST /api/events – Tambah event baru
const createEvent = async (req, res) => {
  try {
    await ensureBookedCountColumn();

    const {
      title, tittle,
      date, time, location,
      price, quota, sold, booked_count,
      status, image, banner_image, poster,
      category,
    } = req.body;
    const eventTitle = title || tittle;

    if (!eventTitle) {
      return res.status(400).json({ message: 'Judul event wajib diisi.' });
    }

    const quotaVal = quota !== undefined ? Number(quota) : 50;
    const bookedVal = booked_count !== undefined
      ? Number(booked_count)
      : (sold !== undefined ? Number(sold) : 0);

    // Tentukan status: admin bisa override, tapi jika sudah penuh otomatis Tiket Penuh
    let statusVal = status || 'Tiket Tersedia';
    if (quotaVal > 0 && bookedVal >= quotaVal) {
      statusVal = 'Tiket Penuh';
    }

    const [result] = await pool.execute(
      `INSERT INTO events
        (title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventTitle,
        date || '',
        time || '',
        location || 'Pendopo Utama RBR',
        price !== undefined ? Number(price) : 0,
        quotaVal,
        bookedVal,
        bookedVal,
        statusVal,
        image || banner_image || poster || '',
        banner_image || poster || image || '',
        category || 'Budaya',
      ]
    );

    const [created] = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json({
      message: 'Event berhasil ditambahkan.',
      data: created[0] ? formatEventRow(created[0]) : null,
    });
  } catch (err) {
    console.error('[createEvent]', err);
    res.status(500).json({ message: 'Gagal menambahkan event.' });
  }
};

// PUT /api/events/:id – Perbarui event (dari Admin Web)
const updateEvent = async (req, res) => {
  try {
    await ensureBookedCountColumn();

    const { id } = req.params;
    const {
      title, tittle,
      date, time, location,
      price, quota, sold, booked_count,
      status, image, banner_image, poster,
      category,
    } = req.body;
    const eventTitle = title || tittle;

    const [existing] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    const cur = existing[0];

    const newQuota = quota !== undefined ? Number(quota) : Number(cur.quota);
    const newBooked = booked_count !== undefined
      ? Number(booked_count)
      : (sold !== undefined ? Number(sold) : Number(cur.booked_count ?? cur.sold ?? 0));

    // Status SELALU ditentukan dari matematika quota vs booked_count
    // Jika quota ditambah melebihi booked_count, paksa Tiket Tersedia
    let newStatus;
    if (newQuota === 0) {
      newStatus = 'Tiket Tersedia'; // unlimited quota
    } else if (newBooked >= newQuota) {
      newStatus = 'Tiket Penuh';
    } else {
      newStatus = 'Tiket Tersedia'; // quota > booked_count → tersedia
    }

    const newImage = (image ?? banner_image ?? poster) !== undefined
      ? (image ?? banner_image ?? poster)
      : cur.image;
    const newBanner = (banner_image ?? poster ?? image) !== undefined
      ? (banner_image ?? poster ?? image)
      : (cur.banner_image ?? cur.image);

    await pool.execute(
      `UPDATE events
          SET title = ?, date = ?, time = ?, location = ?, price = ?,
              quota = ?, sold = ?, booked_count = ?, status = ?,
              image = ?, banner_image = ?, category = ?
        WHERE id = ?`,
      [
        eventTitle !== undefined ? eventTitle : cur.title,
        date !== undefined ? date : cur.date,
        time !== undefined ? time : cur.time,
        location !== undefined ? location : cur.location,
        price !== undefined ? Number(price) : cur.price,
        newQuota,
        newBooked,
        newBooked,
        newStatus,
        newImage,
        newBanner,
        category !== undefined ? category : cur.category,
        id,
      ]
    );

    const [updated] = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?',
      [id]
    );
    res.json({
      message: 'Event berhasil diperbarui.',
      data: updated[0] ? formatEventRow(updated[0]) : null,
    });
  } catch (err) {
    console.error('[updateEvent]', err);
    res.status(500).json({ message: 'Gagal memperbarui event.' });
  }
};

// PATCH /api/events/:id/status – Admin toggle Tiket Tersedia / Tiket Penuh
const patchEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const [existing] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    const allowedStatuses = ['Tiket Tersedia', 'Tiket Penuh'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Status tidak valid. Gunakan salah satu: ${allowedStatuses.join(', ')}`,
      });
    }

    await pool.execute('UPDATE events SET status = ? WHERE id = ?', [status, id]);

    const [updated] = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?',
      [id]
    );
    res.json({
      message: `Status event berhasil diubah menjadi "${status}".`,
      data: updated[0] ? formatEventRow(updated[0]) : null,
    });
  } catch (err) {
    console.error('[patchEventStatus]', err);
    res.status(500).json({ message: 'Gagal memperbarui status event.' });
  }
};

// POST /api/events/:id/book – Pemesanan tiket (tambah booked_count)
// Dipanggil saat tiket dibeli & lunas, atau bisa dipanggil dari mobile saat checkout
const bookEvent = async (req, res) => {
  await ensureBookedCountColumn();
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const {
      quantity = 1,
      customer_name,
      customer_email,
      order_id,
      payment_method,
    } = req.body;

    const qty = Math.max(1, Number(quantity) || 1);

    await conn.beginTransaction();

    // Lock row untuk mencegah race condition
    const [rows] = await conn.execute(
      'SELECT id, quota, booked_count, sold, status FROM events WHERE id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    const ev = rows[0];
    const quota = Number(ev.quota) || 0;
    const currentBooked = Number(ev.booked_count ?? ev.sold ?? 0);

    // Cek ketersediaan (quota 0 = gratis/unlimited)
    if (quota > 0 && currentBooked + qty > quota) {
      await conn.rollback();
      const remaining = Math.max(0, quota - currentBooked);
      return res.status(400).json({
        message: `Tiket tidak mencukupi. Sisa tiket: ${remaining}, diminta: ${qty}.`,
        remaining_tickets: remaining,
      });
    }

    const newBooked = currentBooked + qty;
    const newStatus = quota > 0 && newBooked >= quota ? 'Tiket Penuh' : 'Tiket Tersedia';

    // Update booked_count, sold, dan status
    await conn.execute(
      'UPDATE events SET booked_count = ?, sold = ?, status = ? WHERE id = ?',
      [newBooked, newBooked, newStatus, id]
    );

    // Catat ke ticket_transactions jika ada data transaksi
    let transactionId = null;
    if (customer_name || customer_email || order_id) {
      const [ttResult] = await conn.execute(
        `INSERT INTO ticket_transactions
          (event_id, customer_name, customer_email, quantity, amount, order_id, payment_method, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          customer_name || '',
          customer_email || '',
          qty,
          0, // gross_amount akan diupdate dari payment flow
          order_id || null,
          payment_method || null,
          'Lunas',
        ]
      );
      transactionId = ttResult.insertId;
    }

    await conn.commit();

    // Ambil data event terbaru untuk response
    const [updated] = await conn.execute(
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?',
      [id]
    );

    res.status(200).json({
      message: `Berhasil memesan ${qty} tiket untuk "${ev.title || 'event ini'}".`,
      booked_count: newBooked,
      remaining_tickets: Math.max(0, quota - newBooked),
      status: newStatus,
      is_available: newStatus !== 'Tiket Penuh',
      transaction_id: transactionId,
      event: updated[0] ? formatEventRow(updated[0]) : null,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[bookEvent]', err);
    res.status(500).json({ message: 'Gagal memesan tiket.' });
  } finally {
    conn.release();
  }
};

// DELETE /api/events/:id – Hapus event
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
  patchEventStatus,
  bookEvent,
  deleteEvent,
  formatEventRow, // diekspor agar bisa dipakai paymentController
};
