const pool = require('../config/db');

// Helper untuk memperkaya data event dengan status presale tiers & all_soldout
const enrichEventWithPresaleInfo = (event, tiers = []) => {
  let all_soldout = false;
  let active_tier = null;
  let current_tier_name = null;

  if (tiers && tiers.length > 0) {
    const activeTiers = tiers.filter(
      (t) => t.is_active === 1 || t.is_active === true
    );
    if (activeTiers.length === 0) {
      all_soldout = true;
    } else {
      // Cari tier aktif pertama (berdasarkan tier_order) yang belum habis kuotanya (sold < quota)
      const availableTier = activeTiers.find(
        (t) => Number(t.sold) < Number(t.quota)
      );
      if (!availableTier) {
        all_soldout = true;
      } else {
        all_soldout = false;
        active_tier = availableTier;
        current_tier_name = availableTier.tier_name;
      }
    }
  } else {
    // Jika tidak memiliki tier presale tersendiri, evaluasi dari kuota dan status event standar
    const quota = Number(event.quota) || 0;
    const sold = Number(event.sold) || 0;
    all_soldout =
      (quota > 0 && sold >= quota) ||
      event.status === 'Penuh' ||
      event.status === 'Tiket Penuh';
  }

  return {
    ...event,
    title: event.title || '',
    tittle: event.title || '', // Alias kompatibilitas
    all_soldout,
    is_soldout: all_soldout,
    is_sold_out: all_soldout,
    active_tier,
    current_tier_name,
    presale_tiers: tiers || [],
  };
};

// GET /api/events — Ambil semua agenda/event
const getAllEvents = async (req, res) => {
  try {
    const { month, date, include_pending, scope } = req.query;
    let query =
      'SELECT id, title, date, time, location, price, quota, sold, status, image, banner_image, category, organizer_name, organizer_contact, organizer_email, description FROM events WHERE 1=1';
    const params = [];

    // Jika dipanggil oleh public/mobile app (default), jangan tampilkan yang 'Menunggu Persetujuan' atau 'Ditolak'
    if (include_pending !== 'true' && scope !== 'admin' && scope !== 'all') {
      query +=
        " AND (status IS NULL OR (status != 'Menunggu Persetujuan' AND status != 'Ditolak'))";
    }

    if (date) {
      query += ' AND date LIKE ?';
      params.push(`%${date}%`);
    } else if (month) {
      query += ' AND date LIKE ?';
      params.push(`%${month}%`);
    }

    query += ' ORDER BY date ASC, id ASC';

    const [rows] = await pool.query(query, params);

    // Ambil seluruh data presale tiers untuk evaluasi status sold-out presale
    let allTiers = [];
    try {
      const [tierRows] = await pool.query(
        'SELECT id, event_id, tier_name, tier_order, price, quota, sold, is_active FROM event_presale_tiers ORDER BY tier_order ASC'
      );
      allTiers = tierRows;
    } catch (tierErr) {
      console.warn(
        '[getAllEvents] Peringatan: Gagal memuat event_presale_tiers:',
        tierErr.message
      );
    }

    const tiersByEvent = {};
    for (const tier of allTiers) {
      if (!tiersByEvent[tier.event_id]) tiersByEvent[tier.event_id] = [];
      tiersByEvent[tier.event_id].push(tier);
    }

    const normalized = rows.map((r) =>
      enrichEventWithPresaleInfo(r, tiersByEvent[r.id] || [])
    );
    res.json(normalized);
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
      'SELECT id, title, date, time, location, price, quota, sold, status, image, banner_image, category, organizer_name, organizer_contact, organizer_email, description FROM events WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    const event = rows[0];

    let eventTiers = [];
    try {
      const [tierRows] = await pool.query(
        'SELECT id, event_id, tier_name, tier_order, price, quota, sold, is_active FROM event_presale_tiers WHERE event_id = ? ORDER BY tier_order ASC',
        [id]
      );
      eventTiers = tierRows;
    } catch (tierErr) {
      console.warn(
        '[getEventById] Peringatan: Gagal memuat event_presale_tiers:',
        tierErr.message
      );
    }

    const enriched = enrichEventWithPresaleInfo(event, eventTiers);
    res.json(enriched);
  } catch (err) {
    console.error('[getEventById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail event.' });
  }
};

// POST /api/events — Tambah event baru
const createEvent = async (req, res) => {
  try {
    const { title, tittle, date, time, location, price, quota, sold, status, image, banner_image, poster, category } = req.body;
    const eventTitle = title || tittle;

    if (!eventTitle) {
      return res.status(400).json({ message: 'Judul event wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO events (title, date, time, location, price, quota, sold, status, image, banner_image, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        eventTitle,
        date || '',
        time || '',
        location || 'Pendopo Utama RBR',
        price !== undefined ? Number(price) : 0,
        quota !== undefined ? Number(quota) : 50,
        sold !== undefined ? Number(sold) : 0,
        status || 'Aktif',
        image || banner_image || poster || '',
        banner_image || poster || image || '',
        category || 'Budaya',
      ]
    );

    const [created] = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, status, image, banner_image, category FROM events WHERE id = ?',
      [result.insertId]
    );
    const createdEvent = created[0];
    if (createdEvent) {
      createdEvent.title = createdEvent.title || '';
      createdEvent.tittle = createdEvent.title || '';
    }
    res.status(201).json({ message: 'Event berhasil ditambahkan.', data: createdEvent });
  } catch (err) {
    console.error('[createEvent]', err);
    res.status(500).json({ message: 'Gagal menambahkan event.' });
  }
};

// PUT /api/events/:id — Perbarui event
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, tittle, date, time, location, price, quota, sold, status, image, banner_image, poster, category } = req.body;
    const eventTitle = title || tittle;

    const [existing] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    const current = existing[0];
    await pool.execute(
      'UPDATE events SET title = ?, date = ?, time = ?, location = ?, price = ?, quota = ?, sold = ?, status = ?, image = ?, banner_image = ?, category = ? WHERE id = ?',
      [
        eventTitle !== undefined ? eventTitle : current.title,
        date !== undefined ? date : current.date,
        time !== undefined ? time : current.time,
        location !== undefined ? location : current.location,
        price !== undefined ? Number(price) : current.price,
        quota !== undefined ? Number(quota) : current.quota,
        sold !== undefined ? Number(sold) : current.sold,
        status !== undefined ? status : current.status,
        (image ?? banner_image ?? poster) !== undefined ? (image ?? banner_image ?? poster) : current.image,
        (banner_image ?? poster ?? image) !== undefined ? (banner_image ?? poster ?? image) : (current.banner_image ?? current.image),
        category !== undefined ? category : current.category,
        id,
      ]
    );

    const [updated] = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, status, image, banner_image, category FROM events WHERE id = ?',
      [id]
    );
    const updatedEvent = updated[0];
    if (updatedEvent) {
      updatedEvent.title = updatedEvent.title || '';
      updatedEvent.tittle = updatedEvent.title || '';
    }
    res.json({ message: 'Event berhasil diperbarui.', data: updatedEvent });
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

// POST /api/events/workshop-proposal — Pengajuan lokakarya/workshop baru oleh user
const createWorkshopProposal = async (req, res) => {
  try {
    const {
      title,
      category,
      organizer_name,
      organizer_contact,
      organizer_email,
      date,
      time,
      location,
      price,
      quota,
      description,
      image,
      banner_image,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Nama lokakarya wajib diisi.' });
    }
    if (!organizer_name || !organizer_name.trim()) {
      return res.status(400).json({ message: 'Nama fasilitator/pemohon wajib diisi.' });
    }
    if (!organizer_contact || !organizer_contact.trim()) {
      return res.status(400).json({ message: 'Nomor kontak WhatsApp wajib diisi.' });
    }
    if (!date || !date.trim()) {
      return res.status(400).json({ message: 'Tanggal pelaksanaan lokakarya wajib diisi.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO events 
       (title, date, time, location, price, quota, sold, status, image, banner_image, category, organizer_name, organizer_contact, organizer_email, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        date.trim(),
        time ? time.trim() : '14:00 - 17:00 WIB',
        location ? location.trim() : 'Studio Kriya Lt. 1, Rumah Budaya Ratna',
        price !== undefined ? Number(price) : 0,
        quota !== undefined ? Number(quota) : 25,
        0,
        'Menunggu Persetujuan',
        image || banner_image || '',
        banner_image || image || '',
        category ? category.trim() : 'Lokakarya',
        organizer_name.trim(),
        organizer_contact.trim(),
        organizer_email ? organizer_email.trim() : '',
        description ? description.trim() : '',
      ]
    );

    const [created] = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, status, image, banner_image, category, organizer_name, organizer_contact, organizer_email, description FROM events WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'Pengajuan lokakarya berhasil dikirim. Menunggu persetujuan admin.',
      status: 'Menunggu Persetujuan',
      data: created[0],
    });
  } catch (err) {
    console.error('[createWorkshopProposal]', err);
    res.status(500).json({ message: 'Gagal mengajukan lokakarya.' });
  }
};

// PUT /api/events/:id/approve — Menyetujui lokakarya/event agar tayang publik
const approveEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Event/Lokakarya tidak ditemukan.' });
    }

    await pool.execute("UPDATE events SET status = 'Aktif' WHERE id = ?", [id]);

    const [updated] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    res.json({
      message: 'Lokakarya berhasil disetujui dan kini aktif di jadwal publik.',
      status: 'Aktif',
      data: updated[0],
    });
  } catch (err) {
    console.error('[approveEvent]', err);
    res.status(500).json({ message: 'Gagal menyetujui lokakarya.' });
  }
};

// PUT /api/events/:id/reject — Menolak pengajuan lokakarya
const rejectEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Event/Lokakarya tidak ditemukan.' });
    }

    await pool.execute("UPDATE events SET status = 'Ditolak' WHERE id = ?", [id]);

    const [updated] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    res.json({
      message: 'Pengajuan lokakarya ditolak.',
      status: 'Ditolak',
      data: updated[0],
    });
  } catch (err) {
    console.error('[rejectEvent]', err);
    res.status(500).json({ message: 'Gagal menolak lokakarya.' });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  createWorkshopProposal,
  approveEvent,
  rejectEvent,
};
