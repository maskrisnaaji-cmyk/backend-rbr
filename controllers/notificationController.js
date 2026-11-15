'use strict';

const pool = require('../config/db');

/**
 * GET /api/notifications
 * Mengambil daftar notifikasi terbaru beserta total unread.
 */
const getAllNotifications = async (req, res) => {
  try {
    const { type, unread_only } = req.query;
    let query = 'SELECT * FROM notifications';
    const params = [];
    const conditions = [];

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

    const [rows] = await pool.query(query, params);

    // Hitung total notifikasi belum dibaca
    const [unreadRows] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE is_read = 0'
    );
    const unreadCount = unreadRows[0]?.count || 0;

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
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
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
const markAllAsRead = async (req, res) => {
  try {
    await pool.execute('UPDATE notifications SET is_read = 1');
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
const createNotification = async (req, res) => {
  try {
    const { user_id, order_id, title, message, type, order_status } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title dan message wajib diisi.' });
    }

    const notifType = type || 'order';
    const notifStatus = order_status || 'Pesanan Dibuat';

    const [result] = await pool.execute(
      `INSERT INTO notifications (user_id, order_id, title, message, type, order_status, is_read)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [user_id || null, order_id || null, title, message, notifType, notifStatus]
    );

    const [created] = await pool.execute('SELECT * FROM notifications WHERE id = ?', [result.insertId]);

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
const simulateOrderProgression = async (req, res) => {
  try {
    const orderId = req.body.order_id || 'RBR-1042';
    const tableNumber = req.body.table_number || 'Meja 04';

    // Cari status terakhir untuk orderId ini di tabel notifications
    const [latestNotif] = await pool.query(
      'SELECT order_status FROM notifications WHERE order_id = ? ORDER BY id DESC LIMIT 1',
      [orderId]
    );

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
      await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [orderDbStatus, orderId]);
    } catch (_) {}

    // Masukkan ke tabel notifications
    const [result] = await pool.execute(
      `INSERT INTO notifications (order_id, title, message, type, order_status, is_read)
       VALUES (?, ?, ?, 'order', ?, 0)`,
      [orderId, title, message, nextStatus]
    );

    const [created] = await pool.execute('SELECT * FROM notifications WHERE id = ?', [result.insertId]);

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

module.exports = {
  getAllNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  simulateOrderProgression,
};

