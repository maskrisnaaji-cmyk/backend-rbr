import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import {
  getEventTiersWithActive,
  deductTierQuota,
  refundTierQuota,
} from '../models/presaleModel';
import { getTicketTransactionByOrderId, updateTicketTransactionStatus } from '../models/transactionModel';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/presale/event/:eventId
// Semua tier tiket untuk 1 event (Presale 1, Presale 2, Reguler), sorted by tier_order ASC
// ─────────────────────────────────────────────────────────────────────────────
export const getTiersByEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = String(req.params.eventId);
    const result = await getEventTiersWithActive(pool, eventId);

    return res.json({
      tiers: result.allTiers,
      active_tier: result.activeTier,
      active_price: result.activePrice,
      active_quota: result.activeQuota,
      active_remaining: result.activeRemaining,
      current_tier_name: result.currentTierName,
      all_soldout: result.allSoldOut,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/presale/event/:eventId/active
// Tier presale/reguler aktif yang sekarang berlaku secara berurutan:
// 1. Presale 1 jika sisa kuota Presale 1 > 0
// 2. Presale 2 jika sisa kuota Presale 1 = 0 dan Presale 2 > 0
// 3. Reguler jika sisa kuota Presale 1 & 2 = 0 dan Reguler > 0
// 4. Sold Out jika semua kuota = 0
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = String(req.params.eventId);
    const result = await getEventTiersWithActive(pool, eventId);

    if (result.allTiers.length === 0) {
      return res.status(404).json({ message: 'Tidak ada tier tiket untuk event ini.' });
    }

    if (result.allSoldOut || !result.activeTier) {
      return res.json({
        message: 'Semua tiket presale dan reguler habis (Sold Out).',
        all_soldout: true,
        active_tier: null,
        tier: null,
        current_tier_name: 'Habis / Sold Out',
        tiers: result.allTiers,
      });
    }

    return res.json({
      tier: result.activeTier,
      active_tier: result.activeTier,
      current_tier_name: result.currentTierName,
      active_price: result.activePrice,
      active_quota: result.activeQuota,
      active_remaining: result.activeRemaining,
      all_soldout: false,
      tiers: result.allTiers,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/presale/event/:eventId/tiers
// Tambah tier presale/reguler baru
// Body: { tier_name, tier_order, price, quota, is_active }
// ─────────────────────────────────────────────────────────────────────────────
export const createTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const { tier_name, tier_order = 1, price = 0, quota, is_active = 1 } = req.body;

    if (!tier_name || typeof tier_name !== 'string' || tier_name.trim() === '') {
      return res.status(400).json({ message: 'tier_name wajib diisi.' });
    }
    if (!quota || Number(quota) <= 0) {
      return res.status(400).json({ message: 'quota harus lebih dari 0.' });
    }

    const [result]: any = await pool.query(
      `INSERT INTO event_presale_tiers
         (event_id, tier_name, tier_order, price, quota, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, tier_name.trim(), Number(tier_order) || 1, Number(price) || 0, Number(quota), is_active ? 1 : 0]
    );

    const [rows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({ message: 'Tier tiket berhasil ditambahkan.', tier: (rows as any[])[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/presale/tiers/:tierId
// Update tier (quota, harga, nama, is_active, dll)
// ─────────────────────────────────────────────────────────────────────────────
export const updateTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tierId } = req.params;
    const { tier_name, tier_order, price, quota, is_active } = req.body;

    const [existing]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    const existingTiers = existing as any[];
    if (existingTiers.length === 0) {
      return res.status(404).json({ message: 'Tier presale tidak ditemukan.' });
    }

    const current = existingTiers[0];

    const updatedName     = tier_name  !== undefined ? String(tier_name).trim() : current.tier_name;
    const updatedOrder    = tier_order !== undefined ? Number(tier_order)        : current.tier_order;
    const updatedPrice    = price      !== undefined ? Number(price)             : current.price;
    const updatedQuota    = quota      !== undefined ? Number(quota)             : current.quota;
    const updatedIsActive = is_active  !== undefined ? (is_active ? 1 : 0)      : current.is_active;

    if (updatedName === '') {
      return res.status(400).json({ message: 'tier_name tidak boleh kosong.' });
    }
    if (updatedQuota <= 0) {
      return res.status(400).json({ message: 'quota harus lebih dari 0.' });
    }

    await pool.query(
      `UPDATE event_presale_tiers
       SET tier_name = ?, tier_order = ?, price = ?, quota = ?, is_active = ?
       WHERE id = ?`,
      [updatedName, updatedOrder, updatedPrice, updatedQuota, updatedIsActive, tierId]
    );

    const [updated]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );

    return res.json({ message: 'Tier presale berhasil diperbarui.', tier: (updated as any[])[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/presale/tiers/:tierId
// Hapus tier presale
// ─────────────────────────────────────────────────────────────────────────────
export const deleteTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tierId } = req.params;

    const [existing]: any = await pool.query(
      'SELECT id FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    if ((existing as any[]).length === 0) {
      return res.status(404).json({ message: 'Tier presale tidak ditemukan.' });
    }

    await pool.query('DELETE FROM event_presale_tiers WHERE id = ?', [tierId]);

    return res.json({ message: 'Tier presale berhasil dihapus.' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/presale/tiers/:tierId/sell
// Proses penjualan tiket presale/reguler dengan validasi kuota
// Body: { quantity: number }
// ─────────────────────────────────────────────────────────────────────────────
export const sellTier = async (req: Request, res: Response, next: NextFunction) => {
  const conn = await pool.getConnection();
  try {
    const { tierId } = req.params;
    const { quantity } = req.body;

    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ message: 'quantity harus lebih dari 0.' });
    }
    const qty = Number(quantity);

    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      'SELECT * FROM event_presale_tiers WHERE id = ? FOR UPDATE',
      [tierId]
    );
    const tierRows = rows as any[];
    if (tierRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Tier presale tidak ditemukan.' });
    }

    const tier = tierRows[0];
    const quota = Number(tier.quota) || 0;
    const sold = Number(tier.sold) || 0;
    const remaining = Math.max(0, quota - sold);

    if (sold + qty > quota) {
      await conn.rollback();
      return res.status(409).json({
        message: `Kuota tiket tier ${tier.tier_name} tidak mencukupi.`,
        remaining,
      });
    }

    await conn.query(
      'UPDATE event_presale_tiers SET sold = sold + ? WHERE id = ?',
      [qty, tierId]
    );

    // Update juga tabel events
    await conn.query(
      'UPDATE events SET booked_count = booked_count + ?, sold = sold + ? WHERE id = ?',
      [qty, qty, tier.event_id]
    );

    await conn.commit();

    const [updatedRows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    const updatedTier = (updatedRows as any[])[0];

    // Cari tier berikutnya jika tier ini habis
    let next_tier = null;
    if (updatedTier.sold >= updatedTier.quota) {
      const [nextRows]: any = await pool.query(
        `SELECT * FROM event_presale_tiers
         WHERE event_id = ? AND tier_order > ? AND is_active = 1 AND sold < quota
         ORDER BY tier_order ASC
         LIMIT 1`,
        [updatedTier.event_id, updatedTier.tier_order]
      );
      const nextTierRows = nextRows as any[];
      if (nextTierRows.length > 0) {
        next_tier = nextTierRows[0];
      }
    }

    return res.json({
      message: 'Penjualan tiket presale berhasil.',
      tier: { ...updatedTier, is_soldout: updatedTier.sold >= updatedTier.quota },
      next_tier,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/presale/tiers/:tierId/refund
// Kembalikan kuota tier saat pesanan tiket dibatalkan atau kedaluwarsa
// Body: { quantity: number }
// ─────────────────────────────────────────────────────────────────────────────
export const refundTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tierId = String(req.params.tierId);
    const { quantity = 1 } = req.body;
    const qty = Math.max(1, Number(quantity) || 1);

    const [rows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Tier tiket tidak ditemukan.' });
    }

    const tier = rows[0];
    await refundTierQuota(pool, tierId, tier.event_id, qty);

    const [updatedRows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );

    return res.json({
      message: `Kuota tier ${tier.tier_name} sebanyak ${qty} tiket berhasil dikembalikan.`,
      tier: updatedRows[0],
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/presale/tickets/:orderId/cancel
// Batalkan pemesanan tiket dan kembalikan kuota tier secara otomatis
// ─────────────────────────────────────────────────────────────────────────────
export const cancelTicketOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.orderId);
    const rows = await getTicketTransactionByOrderId(orderId);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Transaksi tiket tidak ditemukan.' });
    }

    const ticket = rows[0];
    if (ticket.status === 'Batal' || ticket.status === 'Gagal') {
      return res.json({ message: 'Transaksi tiket sudah dalam status batal sebelumnya.', ticket });
    }

    const qty = Math.max(1, Number(ticket.quantity) || 1);
    if (ticket.event_id) {
      await refundTierQuota(pool, ticket.tier_id ?? null, ticket.event_id, qty);
    }

    await updateTicketTransactionStatus('Batal', orderId);

    return res.json({
      message: `Pemesanan tiket dengan kode order ${orderId} berhasil dibatalkan. Kuota telah dikembalikan.`,
      order_id: orderId,
      refunded_quantity: qty,
      tier_name: ticket.tier_name,
    });
  } catch (err) {
    next(err);
  }
};
