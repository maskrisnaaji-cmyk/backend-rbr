import { Request, Response } from 'express';
import {
  getAllOrdersQuery,
  getOrderByIdOrCode,
  insertOrUpdateOrder,
  payOrderById,
  updateOrderStatusById,
  deleteOrderByIdOrCode,
} from '../models/orderModel';
import { createNotification } from '../models/notificationModel';

/**
 * Normalisasi items menjadi array terstruktur: [ { name, qty, price }, ... ]
 */
export function normalizeItems(items: any): any[] {
  if (!items) return [];
  if (Array.isArray(items)) {
    return items.map((it) => {
      if (typeof it === 'string') {
        const match = it.match(/^(\d+)x?\s*(.+)$/i);
        if (match) {
          return { name: match[2].trim(), qty: parseInt(match[1], 10) || 1, price: 0 };
        }
        return { name: it.trim(), qty: 1, price: 0 };
      }
      if (typeof it === 'object' && it !== null) {
        return {
          name: it.name || it.title || it.item || 'Item Kedai',
          qty: Number(it.qty || it.quantity || 1),
          price: Number(it.price || 0),
        };
      }
      return { name: String(it), qty: 1, price: 0 };
    });
  }
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      if (Array.isArray(parsed)) return normalizeItems(parsed);
    } catch (_) {}
    return items.split(',').map((it) => {
      const trimmed = it.trim();
      const match = trimmed.match(/^(\d+)x?\s*(.+)$/i);
      if (match) {
        return { name: match[2].trim(), qty: parseInt(match[1], 10) || 1, price: 0 };
      }
      return { name: trimmed, qty: 1, price: 0 };
    });
  }
  return [];
}

/**
 * Format data order dari database ke response JSON standar
 */
export function formatOrderRow(row: any) {
  if (!row) return null;

  let itemsArr: any[] = [];
  try {
    if (typeof row.items === 'string') {
      const parsed = JSON.parse(row.items);
      if (Array.isArray(parsed)) {
        itemsArr = parsed;
      } else {
        itemsArr = normalizeItems(row.items);
      }
    } else if (Array.isArray(row.items)) {
      itemsArr = row.items;
    }
  } catch (_) {
    itemsArr = normalizeItems(row.items);
  }

  const itemsSummary = itemsArr.length > 0
    ? itemsArr.map((i: any) => `${i.qty || 1}x ${i.name}`).join(', ')
    : (typeof row.items === 'string' ? row.items : '');

  const totalPrice = Number(row.total_price) ||
    Number(String(row.total || '0').replace(/[^0-9]/g, '')) || 0;

  const paymentStatus = (row.payment_status || 'UNPAID').toUpperCase();
  const orderStatus = row.order_status || (
    row.status === 'disiapkan' ? 'Disiapkan' :
    row.status === 'selesai' ? 'Selesai' : 'Menunggu'
  );

  return {
    id: row.id,
    order_code: row.order_code || row.id,
    table_number: row.table_number || 'Meja 01',
    table: row.table_number || 'Meja 01', // alias untuk komponen UI yang memakai .table
    items: itemsArr,                     // array objek { name, qty, price }
    items_summary: itemsSummary,         // ringkasan string ramah UI
    total_price: totalPrice,
    total: row.total || `Rp ${totalPrice.toLocaleString('id-ID')}`,
    payment_status: paymentStatus,       // 'UNPAID' | 'PAID'
    order_status: orderStatus,           // 'Menunggu' | 'Disiapkan' | 'Selesai'
    status: orderStatus.toLowerCase(),   // 'menunggu' | 'disiapkan' | 'selesai'
    time: row.time || 'Baru saja',
    created_at: row.created_at || null,
  };
}

/**
 * GET /api/kedai/orders & /api/orders
 * Mengambil antrean pesanan untuk Admin Kedai Kopi.
 * ATURAN: Filter agar HANYA mengembalikan order dengan payment_status = 'PAID'.
 */
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { status, all, payment_status } = req.query as { status?: string; all?: string; payment_status?: string };

    let sql = 'SELECT * FROM orders';
    const conditions: string[] = [];
    const params: any[] = [];

    // Filter ketat antrean pesanan: HANYA yang payment_status = 'PAID'
    if (all === 'true') {
      if (payment_status) {
        conditions.push('payment_status = ?');
        params.push(payment_status.toUpperCase());
      }
    } else {
      conditions.push("payment_status = 'PAID'");
    }

    if (status && status !== 'semua') {
      conditions.push('(order_status = ? OR status = ?)');
      params.push(status, status.toLowerCase());
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC, id DESC';

    const rows = await getAllOrdersQuery(sql, params);
    const formatted = rows.map(formatOrderRow);

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    console.error('[getAllOrders]', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data antrean pesanan.' });
  }
};

/**
 * GET /api/kedai/orders/:id & /api/orders/:id
 * Mengambil detail satu pesanan berdasarkan ID atau Order Code
 */
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await getOrderByIdOrCode(id);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    res.json({
      success: true,
      data: formatOrderRow(rows[0]),
    });
  } catch (err) {
    console.error('[getOrderById]', err);
    res.status(500).json({ success: false, message: 'Gagal mengambil detail pesanan.' });
  }
};

/**
 * POST /api/kedai/orders & /api/orders
 * Membuat atau memperbarui data pesanan dari aplikasi mobile
 */
export const createOrder = async (req: Request, res: Response) => {
  try {
    const {
      id,
      order_code,
      table_number,
      table,
      items,
      total_price,
      total,
      time,
    } = req.body;

    const rawCode = order_code || id || `RBR-${Math.floor(1000 + Math.random() * 9000)}`;
    const formattedCode = rawCode.startsWith('#') ? rawCode.substring(1) : rawCode;
    const rowId = formattedCode.startsWith('RBR-') ? formattedCode : `RBR-${formattedCode}`;
    const tableNum = table_number || table || 'Meja 01';

    const normalizedItems = normalizeItems(items);
    const itemsJsonStr = JSON.stringify(normalizedItems);
    const itemsSummary = normalizedItems.length > 0
      ? normalizedItems.map((i: any) => `${i.qty || 1}x ${i.name}`).join(', ')
      : 'Pesanan Kedai';

    let calcPrice = Number(total_price);
    if (isNaN(calcPrice) || calcPrice <= 0) {
      if (typeof total === 'number') {
        calcPrice = total;
      } else if (typeof total === 'string') {
        calcPrice = Number(total.replace(/[^0-9]/g, '')) || 0;
      } else {
        calcPrice = normalizedItems.reduce((acc: number, curr: any) => acc + ((curr.price || 0) * (curr.qty || 1)), 0);
      }
    }

    const totalFormatted = `Rp ${calcPrice.toLocaleString('id-ID')}`;
    const initialPaymentStatus = 'UNPAID';
    const initialOrderStatus = 'Menunggu';
    const initialStatus = 'menunggu';
    const orderTime = time || 'Baru saja';

    await insertOrUpdateOrder(
      rowId,
      tableNum,
      itemsJsonStr,
      calcPrice,
      totalFormatted,
      initialPaymentStatus,
      initialOrderStatus,
      initialStatus,
      orderTime
    );

    // Otomatis buat notifikasi pesanan baru
    try {
      await createNotification(
        null,
        rowId,
        'Pesanan Baru Dibuat',
        `Pesanan ${rowId} (${tableNum}) berhasil dibuat: ${itemsSummary}. Menunggu proses pembayaran.`,
        'order',
        'Pesanan Dibuat'
      );
    } catch (notifErr: any) {
      console.warn('[createOrder] Warning saving notif:', notifErr.message);
    }

    const created = await getOrderByIdOrCode(rowId);
    res.status(201).json({
      success: true,
      message: 'Pesanan berhasil dibuat (Menunggu Pembayaran).',
      data: formatOrderRow(created[0]),
    });
  } catch (err) {
    console.error('[createOrder]', err);
    res.status(500).json({ success: false, message: 'Gagal membuat pesanan baru.' });
  }
};

/**
 * POST /api/kedai/orders/:id/pay & /api/orders/:id/pay
 * Mengubah payment_status menjadi PAID dan otomatis mengubah status menjadi 'Disiapkan'
 */
export const payOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await getOrderByIdOrCode(id);

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const orderRow: any = existing[0];
    const targetId = orderRow.id;

    await payOrderById(targetId);

    // Kirim notifikasi pembayaran lunas & barista mulai meracik
    try {
      await createNotification(
        null,
        targetId,
        'Pembayaran Berhasil — Pesanan Disiapkan',
        `Pesanan ${targetId} telah lunas. Barista sedang meracik pesanan Anda.`,
        'order',
        'Sedang Diproses'
      );
    } catch (notifErr: any) {
      console.warn('[payOrder] Warning saving notif:', notifErr.message);
    }

    const updated = await getOrderByIdOrCode(targetId);
    res.json({
      success: true,
      message: 'Pesanan berhasil dilunasi. Status diubah menjadi Disiapkan.',
      data: formatOrderRow(updated[0]),
    });
  } catch (err) {
    console.error('[payOrder]', err);
    res.status(500).json({ success: false, message: 'Gagal memproses pelunasan pesanan.' });
  }
};

/**
 * PUT/PATCH /api/kedai/orders/:id/status & /api/orders/:id/status
 * Memperbarui status alur pesanan (Menunggu, Disiapkan, Selesai)
 */
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, order_status } = req.body;

    const inputStatus = order_status || status;
    if (!inputStatus) {
      return res.status(400).json({ success: false, message: 'Status wajib diisi.' });
    }

    // Normalisasi order_status ke 'Menunggu' | 'Disiapkan' | 'Selesai'
    let targetOrderStatus = 'Menunggu';
    let targetStatus = 'menunggu';

    const lower = inputStatus.toLowerCase();
    if (lower === 'disiapkan' || lower === 'sedang diproses') {
      targetOrderStatus = 'Disiapkan';
      targetStatus = 'disiapkan';
    } else if (lower === 'selesai' || lower === 'selesai dinikmati') {
      targetOrderStatus = 'Selesai';
      targetStatus = 'selesai';
    } else if (lower === 'diantar' || lower === 'dalam pengantaran') {
      targetOrderStatus = 'Disiapkan';
      targetStatus = 'diantar';
    }

    const existing = await getOrderByIdOrCode(id);

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    const targetId = existing[0].id;

    await updateOrderStatusById(targetOrderStatus, targetStatus, targetId);

    // Kirim notifikasi
    let notifTitle = 'Update Status Pesanan';
    let notifStatus = targetOrderStatus;
    let notifMessage = `Pesanan ${targetId} diperbarui menjadi ${targetOrderStatus}.`;

    if (targetOrderStatus === 'Disiapkan') {
      notifTitle = 'Pesanan Sedang Disiapkan';
      notifMessage = `Pesanan ${targetId} sedang diracik oleh Barista kami.`;
    } else if (targetOrderStatus === 'Selesai') {
      notifTitle = 'Pesanan Selesai';
      notifMessage = `Pesanan ${targetId} telah selesai. Terima kasih telah berkunjung ke Kedai RBR!`;
    }

    try {
      await createNotification(
        null,
        targetId,
        notifTitle,
        notifMessage,
        'order',
        notifStatus
      );
    } catch (_) {}

    const updated = await getOrderByIdOrCode(targetId);
    res.json({
      success: true,
      message: `Status pesanan ${targetId} diperbarui menjadi ${targetOrderStatus}.`,
      data: formatOrderRow(updated[0]),
    });
  } catch (err) {
    console.error('[updateOrderStatus]', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
  }
};

/**
 * DELETE /api/kedai/orders/:id & /api/orders/:id
 * Menghapus pesanan
 */
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await deleteOrderByIdOrCode(id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
    }

    res.json({ success: true, message: 'Pesanan berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteOrder]', err);
    res.status(500).json({ success: false, message: 'Gagal menghapus pesanan.' });
  }
};

