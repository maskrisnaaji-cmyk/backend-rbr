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
import {
  getEventTiersWithActive,
  lockAndGetActiveTier,
  refundTierQuota,
  ensureDefaultTiers,
} from '../models/presaleModel';
import {
  getTicketTransactionByOrderId,
  updateTicketTransactionStatus,
} from '../models/transactionModel';

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

// GET /api/events/:id – Ambil satu event (termasuk info active_tier, harga aktif, dan sisa kuota aktif)
export const getEventById = async (req: Request, res: Response) => {
  try {
    await ensureBookedCountColumn();

    const id = String(req.params.id);
    let rows: any[];
    const selectQuery =
      'SELECT id, title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category, organizer_name, organizer_contact, organizer_email, description, status_approval FROM events WHERE id = ?';

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
    const formatted = formatEventRow(rows[0]);
    const enriched = await enrichEventWithPresaleInfo(formatted);
    res.json(enriched);
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

    const newEventId = result.insertId;

    // Otomatis buat atau sesuaikan 3 tier (Presale 1, Presale 2, Reguler)
    const {
      presale_tiers,
      presale1_quota, presale1_price,
      presale2_quota, presale2_price,
      reguler_quota, reguler_price,
    } = req.body;

    if (Array.isArray(presale_tiers) && presale_tiers.length > 0) {
      for (const t of presale_tiers) {
        await pool.query(
          `INSERT INTO event_presale_tiers (event_id, tier_name, tier_order, price, quota, sold, is_active)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
          [newEventId, t.tier_name || 'Presale', Number(t.tier_order) || 1, Number(t.price) || 0, Number(t.quota) || 10, t.is_active !== false ? 1 : 0]
        );
      }
    } else if (presale1_quota !== undefined || presale2_quota !== undefined || reguler_quota !== undefined) {
      const p1Quota = Number(presale1_quota) || Math.floor(quotaVal * 0.25);
      const p1Price = presale1_price !== undefined ? Number(presale1_price) : Math.round(Number(price || 0) * 0.7);
      const p2Quota = Number(presale2_quota) || Math.floor(quotaVal * 0.35);
      const p2Price = presale2_price !== undefined ? Number(presale2_price) : Math.round(Number(price || 0) * 0.85);
      const regQuota = Number(reguler_quota) || Math.max(1, quotaVal - p1Quota - p2Quota);
      const regPrice = reguler_price !== undefined ? Number(reguler_price) : Number(price || 0);

      await pool.query(
        `INSERT INTO event_presale_tiers (event_id, tier_name, tier_order, price, quota, sold, is_active)
         VALUES 
         (?, 'Presale 1', 1, ?, ?, 0, 1),
         (?, 'Presale 2', 2, ?, ?, 0, 1),
         (?, 'Reguler', 3, ?, ?, 0, 1)`,
        [newEventId, p1Price, p1Quota, newEventId, p2Price, p2Quota, newEventId, regPrice, regQuota]
      );
    } else {
      await ensureDefaultTiers(pool, newEventId, price !== undefined ? Number(price) : 0, quotaVal, bookedVal);
    }

    const createdRows = await getEventByIdModel(newEventId);
    const userId = extractUserId(req as AuthRequest);
    try {
      await createUserNotification({
        userId,
        orderId: `WORKSHOP-${newEventId}`,
        title: 'Pengajuan Lokakarya Terkirim',
        message: `Pengajuan lokakarya '${title}' berhasil dikirim.`,
        type: 'workshop',
        orderStatus: 'Menunggu Persetujuan',
        email: req.body?.organizer_email || req.body?.email || null,
        phone: req.body?.organizer_contact || req.body?.phone || null,
      });
    } catch (_) {}

    const formatted = createdRows[0] ? formatEventRow(createdRows[0]) : null;
    const enriched = formatted ? await enrichEventWithPresaleInfo(formatted) : null;

    res.status(201).json({
      message: 'Event berhasil ditambahkan.',
      data: enriched,
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

    const id = String(req.params.id);
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
    const formatted = updatedRows[0] ? formatEventRow(updatedRows[0]) : null;
    const enriched = formatted ? await enrichEventWithPresaleInfo(formatted) : null;
    res.json({
      message: 'Event berhasil diperbarui.',
      data: enriched,
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

    const id = String(req.params.id);
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

// POST /api/events/:id/book – Pemesanan tiket dengan penentuan tier otomatis berurutan
// Validasi: mengunci harga & tier aktif (Presale 1 -> Presale 2 -> Reguler), memotong kuota tier
export const bookEvent = async (req: Request, res: Response) => {
  await ensureBookedCountColumn();
  const conn = await pool.getConnection();
  try {
    const id = String(req.params.id);
    const {
      quantity = 1,
      customer_name,
      customer_email,
      order_id,
      payment_method,
    } = req.body;

    const qty = Math.max(1, Number(quantity) || 1);

    await conn.beginTransaction();

    // 1. Kunci & dapatkan tier aktif saat ini secara berurutan
    const tierResult = await lockAndGetActiveTier(conn, id);

    if (tierResult.allSoldOut || !tierResult.activeTier) {
      await conn.rollback();
      return res.status(400).json({
        message: 'Semua tiket presale dan reguler untuk acara ini sudah habis (Sold Out).',
        all_soldout: true,
      });
    }

    const activeTier = tierResult.activeTier;

    // 2. Validasi jumlah beli terhadap sisa kuota tier yang sedang aktif
    if (qty > activeTier.remaining) {
      await conn.rollback();
      return res.status(400).json({
        message: `Jumlah tiket yang dipesan (${qty}) melebihi sisa kuota tier aktif "${activeTier.tier_name}" (sisa: ${activeTier.remaining}).`,
        remaining_tickets: activeTier.remaining,
        active_tier: activeTier.tier_name,
        all_soldout: false,
      });
    }

    // 3. Kunci harga tiket dari tier aktif (bukan dari payload user)
    const lockedUnitPrice = activeTier.price;
    const lockedTotalAmount = lockedUnitPrice * qty;

    // 4. Potong kuota tier terkait
    await conn.execute(
      'UPDATE event_presale_tiers SET sold = sold + ? WHERE id = ?',
      [qty, activeTier.id]
    );

    // 5. Update kuota event total
    const [evRows]: any = await conn.execute(
      'SELECT quota, booked_count, sold, title FROM events WHERE id = ? FOR UPDATE',
      [id]
    );
    let newBooked = qty;
    let newStatus = 'Tiket Tersedia';
    let evTitle = 'Event';
    if (evRows && evRows.length > 0) {
      evTitle = evRows[0].title || 'Event';
      const evQuota = Number(evRows[0].quota) || 0;
      newBooked = Number(evRows[0].booked_count ?? evRows[0].sold ?? 0) + qty;
      newStatus = evQuota > 0 && newBooked >= evQuota ? 'Tiket Penuh' : 'Tiket Tersedia';
      await conn.execute(
        'UPDATE events SET booked_count = ?, sold = ?, status = ? WHERE id = ?',
        [newBooked, newBooked, newStatus, id]
      );
    }

    // 6. Catat ke ticket_transactions dengan mengunci tier_id & tier_name
    let transactionId = null;
    const cleanOrderId = order_id || `RBR-EVT-${Date.now()}`;
    const [ttResult]: any = await conn.execute(
      `INSERT INTO ticket_transactions
        (event_id, customer_name, customer_email, quantity, amount, order_id, payment_method, status, tier_id, tier_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        customer_name || '',
        customer_email || '',
        qty,
        lockedTotalAmount,
        cleanOrderId,
        payment_method || 'Kasir',
        payment_method === 'Midtrans' ? 'Menunggu Pembayaran' : 'Lunas',
        activeTier.id,
        activeTier.tier_name,
      ]
    );
    transactionId = ttResult.insertId;

    await conn.commit();

    // 7. Ambil data event terbaru yang sudah diperkaya dengan info presale
    const [updated]: any = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    const formatted = formatEventRow(updated[0]);
    const enriched = await enrichEventWithPresaleInfo(formatted);

    res.status(200).json({
      message: `Berhasil memesan ${qty} tiket (${activeTier.tier_name}) untuk "${evTitle}".`,
      booked_count: newBooked,
      remaining_tickets: Math.max(0, activeTier.remaining - qty),
      active_tier: {
        id: activeTier.id,
        tier_name: activeTier.tier_name,
        price: lockedUnitPrice,
        remaining: Math.max(0, activeTier.remaining - qty),
      },
      status: newStatus,
      is_available: newStatus !== 'Tiket Penuh',
      transaction_id: transactionId,
      order_id: cleanOrderId,
      amount: lockedTotalAmount,
      event: enriched,
    });
  } catch (err: any) {
    await conn.rollback();
    console.error('[bookEvent]', err);
    res.status(500).json({ message: 'Gagal memesan tiket: ' + (err.message || 'Server error.') });
  } finally {
    conn.release();
  }
};

// POST /api/events/tickets/:orderId/cancel – Batalkan pemesanan tiket & kembalikan kuota tier
export const cancelEventTicket = async (req: Request, res: Response) => {
  try {
    const orderId = String(req.params.orderId);
    const rows = await getTicketTransactionByOrderId(orderId);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Transaksi tiket tidak ditemukan.' });
    }

    const ticket = rows[0];
    if (ticket.status === 'Batal' || ticket.status === 'Gagal') {
      return res.json({ message: 'Transaksi tiket sudah dibatalkan sebelumnya.', ticket });
    }

    const qty = Math.max(1, Number(ticket.quantity) || 1);
    if (ticket.event_id) {
      await refundTierQuota(pool, ticket.tier_id ?? null, ticket.event_id, qty);
    }

    await updateTicketTransactionStatus('Batal', orderId);

    return res.json({
      message: `Pemesanan tiket ${orderId} berhasil dibatalkan dan kuota telah dikembalikan.`,
      order_id: orderId,
      tier_name: ticket.tier_name,
      refunded_quantity: qty,
    });
  } catch (err: any) {
    console.error('[cancelEventTicket]', err);
    res.status(500).json({ message: 'Gagal membatalkan tiket.' });
  }
};

// DELETE /api/events/:id – Hapus event
export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
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
// Helper: enrichEventWithPresaleInfo — tambah info presale tier aktif ke row event
// ─────────────────────────────────────────────────────────────────────────────
export async function enrichEventWithPresaleInfo(event: any): Promise<any> {
  try {
    const tierResult = await getEventTiersWithActive(pool, event.id, {
      defaultPrice: event.price,
      defaultQuota: event.quota,
    });

    return {
      ...event,
      price: tierResult.activePrice,
      remaining_tickets: tierResult.activeRemaining,
      status: tierResult.allSoldOut ? 'Tiket Penuh' : 'Tiket Tersedia',
      is_available: !tierResult.allSoldOut,
      all_soldout: tierResult.allSoldOut,
      active_tier: tierResult.activeTier,
      active_price: tierResult.activePrice,
      active_quota: tierResult.activeQuota,
      active_remaining: tierResult.activeRemaining,
      current_tier_name: tierResult.currentTierName,
      presale_tiers: tierResult.allTiers,
    };
  } catch (err: any) {
    return {
      ...event,
      all_soldout: false,
      active_tier: null,
      active_price: event.price || 0,
      active_quota: event.quota || 0,
      active_remaining: event.remaining_tickets || 0,
      current_tier_name: null,
      presale_tiers: [],
    };
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
    const id = String(req.params.id);

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
    const id = String(req.params.id);
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

