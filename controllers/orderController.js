'use strict';

const pool = require('../config/db');

/**
 * GET /api/orders
 * Mengambil semua pesanan kedai
 */
const getAllOrders = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[getAllOrders]', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data pesanan.' });
  }
};

/**
 * POST /api/orders
 * Membuat pesanan baru + otomatis buat notifikasi "Pesanan Dibuat"
 */
const createOrder = async (req, res) => {
  try {
    const { id, table_number, items, total, status, order_status } = req.body;
    const rawId = id || `RBR-${Math.floor(1000 + Math.random() * 9000)}`;
    const formattedOrderId = rawId.startsWith('#') ? rawId : `#${rawId}`;
    const table = table_number || 'Meja 01';
    const itemsStr = typeof items === 'string' ? items : Array.isArray(items) ? items.join(', ') : 'Pesanan Kedai';
    const totalStr = typeof total === 'number' ? `Rp ${total.toLocaleString('id-ID')}` : (total || 'Rp 0');
    const orderStatus = status || 'menunggu';
    const displayStatus = order_status || 'Pesanan Dibuat';

    await pool.execute(
      'INSERT INTO orders (id, table_number, items, total, status, time) VALUES (?, ?, ?, ?, ?, ?)',
      [formattedOrderId, table, itemsStr, totalStr, orderStatus, 'Baru saja']
    );

    // Otomatis buat notifikasi pesanan baru
    try {
      await pool.execute(
        `INSERT INTO notifications (order_id, title, message, type, order_status, is_read)
         VALUES (?, ?, ?, 'order', ?, 0)`,
        [
          formattedOrderId,
          'Pesanan Baru Dibuat',
          `Pesanan ${formattedOrderId} (${table}) berhasil dibuat: ${itemsStr}. Status: ${displayStatus} (Menunggu Konfirmasi Barista).`,
          displayStatus,
        ]
      );
    } catch (notifErr) {
      console.warn('[createOrder] Warning saving notif:', notifErr.message);
    }

    const [created] = await pool.execute('SELECT * FROM orders WHERE id = ?', [formattedOrderId]);
    res.status(201).json({
      success: true,
      message: 'Pesanan berhasil dibuat.',
      data: created[0],
    });
  } catch (err) {
    console.error('[createOrder]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat pesanan.' });
  }
};

/**
 * PUT /api/orders/:id/status
 * Memperbarui status pesanan + otomatis kirim notifikasi update
 */
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'menunggu', 'disiapkan', 'diantar', 'selesai'

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status wajib diisi.' });
    }

    await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

    // Pemetaan status human-readable untuk notifikasi
    let notifTitle = 'Update Status Pesanan';
    let notifStatus = 'Sedang Diproses';
    let notifMessage = `Pesanan #${id} telah diperbarui ke status: ${status}.`;

    if (status === 'disiapkan' || status === 'Sedang Diproses') {
      notifTitle = 'Pesanan Sedang Diproses';
      notifStatus = 'Sedang Diproses';
      notifMessage = `Pesanan #${id} sedang diracik oleh Barista kami.`;
    } else if (status === 'diantar' || status === 'Dalam Pengantaran') {
      notifTitle = 'Pesanan Dalam Pengantaran';
      notifStatus = 'Dalam Pengantaran';
      notifMessage = `Pesanan #${id} sedang diantarkan oleh staf menuju meja Anda.`;
    } else if (status === 'selesai' || status === 'Selesai') {
      notifTitle = 'Pesanan Selesai';
      notifStatus = 'Selesai';
      notifMessage = `Pesanan #${id} telah selesai dinikmati. Terima kasih!`;
    }

    try {
      await pool.execute(
        `INSERT INTO notifications (order_id, title, message, type, order_status, is_read)
         VALUES (?, ?, ?, 'order', ?, 0)`,
        [id, notifTitle, notifMessage, notifStatus]
      );
    } catch (_) {}

    const [updated] = await pool.execute('SELECT * FROM orders WHERE id = ?', [id]);
    res.json({
      success: true,
      message: `Status pesanan #${id} diperbarui menjadi ${status}.`,
      data: updated[0],
    });
  } catch (err) {
    console.error('[updateOrderStatus]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
  }
};

module.exports = {
  getAllOrders,
  createOrder,
  updateOrderStatus,
};

