import { Request, Response } from 'express';
import pool from '../config/db';
import { createUserNotification } from '../models/notificationModel';
import { AuthRequest, extractUserId } from '../middleware/authMiddleware';
import {
  getAllEvents as getAllEventsModel,
  getEventById as getEventByIdModel,
  getEventByIdForUpdate,
  createEvent as createEventModel,
  updateEvent as updateEventModel,
  patchEventStatus as patchEventStatusModel,
  updateEventBooking,
  deleteEvent as deleteEventModel,
} from '../models/eventModel';

// ─── Helper: pastikan inisialisasi tabel ditangani di init_db.ts ───────────────
async function ensureBookedCountColumn() {
  // Inisialisasi kolom tabel events sudah ditangani di init_db.ts
  return;
}

// ─── Helper: format satu row event menjadi response standar ──────────────────
export function formatEventRow(r: any) {
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
    organizer_name: r.organizer_name || '',
    organizer_contact: r.organizer_contact || '',
    organizer_email: r.organizer_email || '',
    description: r.description || '',
    status_approval: r.status_approval || 'approved',
  };
}

// ─── Helper: sinkron status ke DB setelah perubahan booked_count ──────────────
async function syncEventStatus(p: any, eventId: number | string) {
  await p.execute(
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
export const getAllEvents = async (req: Request, res: Response) => {
  try {
    await ensureBookedCountColumn();

    const { month, date, include_pending } = req.query as {
      month?: string;
      date?: string;
      include_pending?: string;
    };

    let query =
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category, organizer_name, organizer_contact, organizer_email, description, status_approval FROM events';
    const params: any[] = [];
    const whereConditions: string[] = [];

    if (include_pending !== 'true') {
      whereConditions.push("(status_approval = 'approved' OR status_approval IS NULL)");
    }

    if (date) {
      whereConditions.push('date LIKE ?');
      params.push(`%${date}%`);
    } else if (month) {
      whereConditions.push('date LIKE ?');
      params.push(`%${month}%`);
    }

    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }

    query += ' ORDER BY date ASC, id ASC';

    let rows: any[];
    try {
      const [r] = await pool.query(query, params);
      rows = r as any[];
    } catch (queryErr: any) {
      // Fallback query aman jika kolom opsional/filter terkendala
      const fallbackQuery = 'SELECT * FROM events ORDER BY date ASC, id ASC';
      const [r] = await pool.query(fallbackQuery);
      rows = r as any[];
    }

    const formattedRows = rows.map(formatEventRow);
    const enrichedRows = await Promise.all(formattedRows.map(enrichEventWithPresaleInfo));
    res.json(enrichedRows);
  } catch (err) {
    console.error('[getAllEvents]', err);
    res.status(500).json({ message: 'Gagal mengambil data event/agenda.' });
  }
};

// GET /api/events/:id – Ambil satu event
export const getEventById = async (req: Request, res: Response) => {
  try {
    await ensureBookedCountColumn();

    const { id } = req.params;
    let rows: any[];
    const selectQuery =
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?';

    try {
      const [r] = await pool.execute(selectQuery, [id]);
      rows = r as any[];
    } catch (queryErr: any) {
      const [r] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
      rows = r as any[];
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

// POST /api/events – Buat event baru
export const createEvent = async (req: Request, res: Response) => {
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

    const result = await createEventModel(
      eventTitle,
      date || '',
      time || '',
      location || 'Pendopo Utama RBR',
      price !== undefined ? Number(price) : 0,
      quotaVal,
      bookedVal,
      bookedVal,
      statusVal,
      (image ?? banner_image ?? poster) || '',
      (banner_image ?? poster ?? image) || '',
      category || 'Budaya'
    );

    const createdRows = await getEventByIdModel(result.insertId);
    const userId = extractUserId(req as AuthRequest);
    try {
      await createUserNotification({
        userId,
        orderId: `WORKSHOP-${result.insertId}`,
        title: 'Pengajuan Lokakarya Terkirim',
        message: `Pengajuan lokakarya '${title}' berhasil dikirim.`,
        type: 'workshop',
        orderStatus: 'Menunggu Persetujuan',
        email: req.body?.organizer_email || req.body?.email || null,
        phone: req.body?.organizer_contact || req.body?.phone || null,
      });
    } catch (_) {}

    res.status(201).json({
      message: 'Event berhasil ditambahkan.',
      data: createdRows[0] ? formatEventRow(createdRows[0]) : null,
    });
  } catch (err) {
    console.error('[createEvent]', err);
    res.status(500).json({ message: 'Gagal menambahkan event.' });
  }
};

// PUT /api/events/:id – Perbarui event
export const updateEvent = async (req: Request, res: Response) => {
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

    const existing = await getEventByIdModel(id);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    const cur: any = existing[0];

    const newQuota = quota !== undefined ? Number(quota) : Number(cur.quota);
    const newBooked = booked_count !== undefined
      ? Number(booked_count)
      : (sold !== undefined ? Number(sold) : Number(cur.booked_count ?? cur.sold ?? 0));

    // Status SELALU ditentukan dari matematika quota vs booked_count
    // Jika quota ditambah melebihi booked_count, paksa Tiket Tersedia
    let newStatus: string;
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

    await updateEventModel(
      eventTitle !== undefined ? eventTitle : cur.title,
      date !== undefined ? date : cur.date,
      time !== undefined ? time : cur.time,
      location !== undefined ? location : cur.location,
      price !== undefined ? Number(price) : Number(cur.price),
      newQuota,
      newBooked,
      newBooked,
      newStatus,
      newImage || '',
      newBanner || '',
      category !== undefined ? category : cur.category,
      id
    );

    const updatedRows = await getEventByIdModel(id);
    res.json({
      message: 'Event berhasil diperbarui.',
      data: updatedRows[0] ? formatEventRow(updatedRows[0]) : null,
    });
  } catch (err) {
    console.error('[updateEvent]', err);
    res.status(500).json({ message: 'Gagal memperbarui data event.' });
  }
};

// PATCH /api/events/:id/status – Ubah status ketersediaan tiket secara manual
export const patchEventStatus = async (req: Request, res: Response) => {
  try {
    await ensureBookedCountColumn();

    const { id } = req.params;
    const { status } = req.body;

    const existing = await getEventByIdModel(id);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    const allowedStatuses = ['Tiket Tersedia', 'Tiket Penuh'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: `Status tidak valid. Gunakan salah satu: ${allowedStatuses.join(', ')}`,
      });
    }

    await patchEventStatusModel(status, id);

    const updatedRows = await getEventByIdModel(id);
    res.json({
      message: `Status event berhasil diubah menjadi "${status}".`,
      data: updatedRows[0] ? formatEventRow(updatedRows[0]) : null,
    });
  } catch (err) {
    console.error('[patchEventStatus]', err);
    res.status(500).json({ message: 'Gagal memperbarui status event.' });
  }
};

// POST /api/events/:id/book – Pemesanan tiket (tambah booked_count)
// Dipanggil saat tiket dibeli & lunas, atau bisa dipanggil dari mobile saat checkout
export const bookEvent = async (req: Request, res: Response) => {
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
    const [rows]: any = await conn.execute(
      'SELECT id, title, quota, booked_count, sold, status FROM events WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!rows || rows.length === 0) {
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
      const [ttResult]: any = await conn.execute(
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
    const [updated]: any = await conn.execute(
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
export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await deleteEventModel(id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }
    res.json({ message: 'Event berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteEvent]', err);
    res.status(500).json({ message: 'Gagal menghapus event.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enrichEventWithPresaleInfo — tambah info presale ke row event
// ─────────────────────────────────────────────────────────────────────────────
async function enrichEventWithPresaleInfo(event: any): Promise<any> {
  try {
    const [tiers]: any = await pool.query(
      `SELECT id, tier_name, tier_order, price, quota, sold, is_active
       FROM event_presale_tiers
       WHERE event_id = ?
       ORDER BY tier_order ASC`,
      [event.id]
    );

    if (!tiers || tiers.length === 0) {
      return { ...event, all_soldout: false, current_tier_name: null, presale_tiers: [] };
    }

    // Cari tier aktif paling awal yang belum sold out
    const activeTier = tiers.find((t: any) => t.is_active && t.sold < t.quota);
    const all_soldout = !activeTier;
    const current_tier_name = activeTier ? activeTier.tier_name : null;

    return {
      ...event,
      all_soldout,
      current_tier_name,
      presale_tiers: tiers.map((t: any) => ({
        ...t,
        is_soldout: t.sold >= t.quota,
        is_current_active: activeTier ? t.id === activeTier.id : false,
      })),
    };
  } catch {
    return { ...event, all_soldout: false, current_tier_name: null, presale_tiers: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/events/workshop-proposal – Pengajuan lokakarya baru oleh user
// ─────────────────────────────────────────────────────────────────────────────
export const createWorkshopProposal = async (req: Request, res: Response) => {
  try {
    const {
      title,
      date,
      time,
      location,
      price,
      quota,
      category,
      image,
      banner_image,
      organizer_name,
      organizer_contact,
      organizer_email,
      description,
    } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Judul lokakarya wajib diisi.' });
    }

    const [result]: any = await pool.query(
      `INSERT INTO events
         (title, date, time, location, price, quota, sold, booked_count,
          status, image, banner_image, category,
          organizer_name, organizer_contact, organizer_email, description, status_approval)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'Tiket Tersedia', ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        title,
        date || '',
        time || '',
        location || 'Belum ditentukan',
        price !== undefined ? Number(price) : 0,
        quota !== undefined ? Number(quota) : 50,
        image || '',
        banner_image || image || '',
        category || 'Lokakarya',
        organizer_name || '',
        organizer_contact || '',
        organizer_email || '',
        description || '',
      ]
    );

    const userId = extractUserId(req as AuthRequest);
    try {
      await createUserNotification({
        userId,
        orderId: `WORKSHOP-${result.insertId}`,
        title: 'Pengajuan Lokakarya Terkirim',
        message: `Pengajuan lokakarya '${title}' berhasil dikirim.`,
        type: 'workshop',
        orderStatus: 'Menunggu Persetujuan',
        email: req.body?.organizer_email || req.body?.email || null,
        phone: req.body?.organizer_contact || req.body?.phone || null,
      });
    } catch (_) {}

    res.status(201).json({
      message: 'Pengajuan lokakarya berhasil dikirim. Menunggu persetujuan admin.',
      id: result.insertId,
      status_approval: 'pending',
    });
  } catch (err) {
    console.error('[createWorkshopProposal]', err);
    res.status(500).json({ message: 'Gagal mengirim pengajuan lokakarya.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/events/:id/approve – Admin menyetujui event/lokakarya
// ─────────────────────────────────────────────────────────────────────────────
export const approveEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing]: any = await pool.execute(
      'SELECT id, title FROM events WHERE id = ?',
      [id]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    await pool.execute(
      "UPDATE events SET status_approval = 'approved' WHERE id = ?",
      [id]
    );

    const [updated]: any = await pool.execute(
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category FROM events WHERE id = ?',
      [id]
    );

    res.json({
      message: `Event "${existing[0].title}" berhasil disetujui.`,
      data: updated[0] ? formatEventRow(updated[0]) : null,
    });
  } catch (err) {
    console.error('[approveEvent]', err);
    res.status(500).json({ message: 'Gagal menyetujui event.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/events/:id/reject – Admin menolak event/lokakarya
// ─────────────────────────────────────────────────────────────────────────────
export const rejectEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [existing]: any = await pool.execute(
      'SELECT id, title FROM events WHERE id = ?',
      [id]
    );
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Event tidak ditemukan.' });
    }

    await pool.execute(
      "UPDATE events SET status_approval = 'rejected', rejection_reason = ? WHERE id = ?",
      [reason || null, id]
    );

    res.json({
      message: `Event "${existing[0].title}" berhasil ditolak.`,
      reason: reason || null,
    });
  } catch (err) {
    console.error('[rejectEvent]', err);
    res.status(500).json({ message: 'Gagal menolak event.' });
  }
};

