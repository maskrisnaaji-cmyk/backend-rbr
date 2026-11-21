import { Request, Response } from 'express';
import {
  getNotificationsQuery,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification as createNotificationModel,
  getNotificationById,
  getLatestOrderNotification,
} from '../models/notificationModel';
import { updateOrderStatusByCode } from '../models/orderModel';

/**
 * GET /api/notifications
 * Mengambil daftar notifikasi terbaru beserta total unread.
 */
export const getAllNotifications = async (req: Request, res: Response) => {
  try {
    const { type, unread_only } = req.query as { type?: string; unread_only?: string };
    let query = 'SELECT * FROM notifications';
    const params: any[] = [];
    const conditions: string[] = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (unread_only === 'true' || unread_only === '1') {
      conditions.push('is_read = 0');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC, id DESC LIMIT 50';

    const rows = await getNotificationsQuery(query, params);

    // Hitung total notifikasi belum dibaca
    const unreadCount = await getUnreadNotificationsCount();

    res.json({
      success: true,
      unreadCount,
      data: rows,
    });
  } catch (err) {
    console.error('[getAllNotifications]', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data notifikasi.' });
  }
};

/**
 * PUT /api/notifications/:id/read
 * Menandai satu notifikasi sebagai telah dibaca.
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await markNotificationAsRead(id);
    res.json({ success: true, message: 'Notifikasi berhasil ditandai telah dibaca.' });
  } catch (err) {
    console.error('[markAsRead]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status notifikasi.' });
  }
};

/**
 * PUT /api/notifications/read-all
 * Menandai semua notifikasi sebagai telah dibaca.
 */
export const markAllAsRead = async (_req: Request, res: Response) => {
  try {
    await markAllNotificationsAsRead();
    res.json({ success: true, message: 'Semua notifikasi telah ditandai dibaca.' });
  } catch (err) {
    console.error('[markAllAsRead]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui notifikasi.' });
  }
};

/**
 * POST /api/notifications
 * Membuat notifikasi baru secara eksplisit.
 */
export const createNotification = async (req: Request, res: Response) => {
  try {
    const { user_id, order_id, title, message, type, order_status } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title dan message wajib diisi.' });
    }

    const notifType = type || 'order';
    const notifStatus = order_status || 'Pesanan Dibuat';

    const result = await createNotificationModel(
      user_id || null,
      order_id || null,
      title,
      message,
      notifType,
      notifStatus
    );

    const created = await getNotificationById(result.insertId);

    res.status(201).json({
      success: true,
      message: 'Notifikasi berhasil dibuat.',
      data: created[0],
    });
  } catch (err) {
    console.error('[createNotification]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat notifikasi.' });
  }
};

/**
 * POST /api/notifications/simulate
 * Mensimulasikan progres status pesanan real-time:
 * Pesanan Dibuat -> Sedang Diproses -> Dalam Pengantaran -> Selesai
 */
export const simulateOrderProgression = async (req: Request, res: Response) => {
  try {
    const orderId = req.body.order_id || 'RBR-1042';
    const tableNumber = req.body.table_number || 'Meja 04';

    // Cari status terakhir untuk orderId ini di tabel notifications
    const latestNotif = await getLatestOrderNotification(orderId);

    const currentStatus = latestNotif[0]?.order_status || 'Selesai';
    let nextStatus = 'Pesanan Dibuat';
    let title = 'Pesanan Baru Dibuat';
    let message = `Pesanan #${orderId} (${tableNumber}) berhasil dibuat dan menunggu konfirmasi barista.`;

    if (currentStatus === 'Pesanan Dibuat') {
      nextStatus = 'Sedang Diproses';
      title = 'Pesanan Sedang Diproses';
      message = `Pesanan #${orderId} (${tableNumber}) sedang diracik oleh Barista kami.`;
    } else if (currentStatus === 'Sedang Diproses') {
      nextStatus = 'Dalam Pengantaran';
      title = 'Pesanan Dalam Pengantaran';
      message = `Pesanan #${orderId} sedang diantarkan oleh staf menuju ${tableNumber}.`;
    } else if (currentStatus === 'Dalam Pengantaran') {
      nextStatus = 'Selesai';
      title = 'Pesanan Selesai';
      message = `Pesanan #${orderId} telah selesai diantar ke ${tableNumber}. Selamat menikmati sajian Rumah Budaya Ratna!`;
    } else {
      // Dari Selesai -> Reset ke Pesanan Baru
      nextStatus = 'Pesanan Dibuat';
      title = 'Pesanan Baru Dibuat';
      message = `Pesanan #${orderId} (${tableNumber}) berhasil dicatat di sistem kasir.`;
    }

    // Update status di tabel orders jika ada
    try {
      const orderDbStatus = nextStatus === 'Pesanan Dibuat' ? 'menunggu' : nextStatus === 'Sedang Diproses' ? 'disiapkan' : nextStatus === 'Dalam Pengantaran' ? 'diantar' : 'selesai';
      const orderUiStatus = nextStatus === 'Pesanan Dibuat' ? 'Menunggu' : (nextStatus === 'Sedang Diproses' || nextStatus === 'Dalam Pengantaran') ? 'Disiapkan' : 'Selesai';
      await updateOrderStatusByCode(orderDbStatus, orderUiStatus, orderId);
    } catch (_) {}

    // Masukkan ke tabel notifications
    const result = await createNotificationModel(
      null,
      orderId,
      title,
      message,
      'order',
      nextStatus
    );

    const created = await getNotificationById(result.insertId);

    res.json({
      success: true,
      message: `Status pesanan #${orderId} berhasil diperbarui ke: ${nextStatus}`,
      data: created[0],
    });
  } catch (err) {
    console.error('[simulateOrderProgression]', err);
    res.status(500).json({ success: false, message: 'Gagal mensimulasikan status pesanan.' });
  }
};

