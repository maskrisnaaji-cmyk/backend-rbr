'use strict';

const pool = require('../config/db');

const toItems = (items) => {
  if (Array.isArray(items)) return items;
  if (typeof items !== 'string' || !items.trim()) return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const itemsSummary = (items) => toItems(items)
  .map((item) => `${Number(item.quantity || item.qty || 1)}x ${item.name || item.title || 'Pesanan'}`)
  .join(', ');

const mapOrder = (row) => ({
  ...row,
  order_code: row.order_code || row.id,
  total_price: Number(row.total_price || 0),
  items: toItems(row.items_json || row.items),
  items_summary: row.items_summary || row.items || '',
  order_status: row.order_status || row.status || 'menunggu',
  payment_status: row.payment_status || 'UNPAID',
});

/** GET /api/kedai/orders */
const getOrders = async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
    res.json({ success: true, data: rows.map(mapOrder) });
  } catch (err) {
    console.error('[kedai:getOrders]', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil pesanan kedai.' });
  }
};

/** POST /api/kedai/orders */
const createOrder = async (req, res) => {
  try {
    const { order_code, table_number, items, total_price } = req.body;
    const orderCode = String(order_code || `RBR-KEDAI-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const table = String(table_number || 'Meja 01');
    const orderItems = toItems(items);
    const total = Math.max(0, Math.round(Number(total_price) || 0));
    const summary = itemsSummary(orderItems) || (typeof items === 'string' ? items : 'Pesanan Kedai');

    await pool.execute(
      `INSERT INTO orders
        (id, table_number, items, total, total_price, items_json, items_summary,
         status, order_status, payment_status, time)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu', 'menunggu', 'UNPAID', 'Baru saja')
       ON DUPLICATE KEY UPDATE
         table_number = VALUES(table_number), items = VALUES(items), total = VALUES(total),
         total_price = VALUES(total_price), items_json = VALUES(items_json),
         items_summary = VALUES(items_summary)`,
      [orderCode, table, summary, `Rp ${total.toLocaleString('id-ID')}`, total,
        JSON.stringify(orderItems), summary]
    );

    try {
      await pool.execute(
        `INSERT INTO notifications (order_id, title, message, type, order_status, is_read)
         VALUES (?, ?, ?, 'order', ?, 0)`,
        [orderCode, 'Pesanan Kedai Baru', `Pesanan ${orderCode} (${table}) menunggu pembayaran.`, 'Menunggu Pembayaran']
      );
    } catch (notificationError) {
      console.warn('[kedai:createOrder] notification warning:', notificationError.message);
    }

    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [orderCode]);
    res.status(201).json({ success: true, message: 'Pesanan kedai berhasil dibuat.', data: mapOrder(rows[0]) });
  } catch (err) {
    console.error('[kedai:createOrder]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat pesanan kedai.' });
  }
};

/** PATCH /api/kedai/orders/:id/status */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = String(req.body.order_status || req.body.status || '').toLowerCase();
    if (!['menunggu', 'disiapkan', 'selesai'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status pesanan tidak valid.' });
    }
    const [result] = await pool.execute(
      'UPDATE orders SET status = ?, order_status = ? WHERE id = ?', [status, status, id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [id]);
    res.json({ success: true, data: mapOrder(rows[0]) });
  } catch (err) {
    console.error('[kedai:updateStatus]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
  }
};

/** PATCH /api/kedai/orders/:id/pay — dipakai untuk pembayaran tunai atau verifikasi mobile */
const confirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      `UPDATE orders SET payment_status = 'PAID' WHERE id = ?`, [id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [id]);
    res.json({ success: true, message: 'Pembayaran pesanan dikonfirmasi.', data: mapOrder(rows[0]) });
  } catch (err) {
    console.error('[kedai:confirmPayment]', err);
    res.status(500).json({ success: false, message: 'Gagal mengonfirmasi pembayaran pesanan.' });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM orders WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    res.json({ success: true, message: 'Pesanan berhasil dihapus.' });
  } catch (err) {
    console.error('[kedai:deleteOrder]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus pesanan.' });
  }
};

module.exports = { getOrders, createOrder, updateStatus, confirmPayment, deleteOrder };
