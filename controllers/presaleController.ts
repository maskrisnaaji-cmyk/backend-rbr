import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: tandai tier mana yang sedang aktif (paling awal & belum sold out)
// ─────────────────────────────────────────────────────────────────────────────
function markCurrentActive(tiers: any[]): any[] {
  let currentSet = false;
  return tiers.map((t) => {
    const is_soldout = t.sold >= t.quota;
    let is_current_active = false;
    if (!currentSet && t.is_active && !is_soldout) {
      is_current_active = true;
      currentSet = true;
    }
    return { ...t, is_soldout, is_current_active };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/presale/event/:eventId
// Semua tier presale untuk 1 event, sorted by tier_order ASC
// ─────────────────────────────────────────────────────────────────────────────
export const getTiersByEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const [rows]: any = await pool.query(
      `SELECT * FROM event_presale_tiers
       WHERE event_id = ?
       ORDER BY tier_order ASC`,
      [eventId]
    );

    const tiers = markCurrentActive(rows as any[]);
    return res.json({ tiers });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/presale/event/:eventId/active
// Tier presale aktif yang sekarang berlaku (terendah tier_order, belum soldout)
// ─────────────────────────────────────────────────────────────────────────────
export const getActiveTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;

    const [all]: any = await pool.query(
      `SELECT * FROM event_presale_tiers
       WHERE event_id = ?
       ORDER BY tier_order ASC`,
      [eventId]
    );

    const allTiers = all as any[];

    if (allTiers.length === 0) {
      return res.status(404).json({ message: 'Tidak ada tier presale untuk event ini.' });
    }

    // Cari tier aktif paling awal yang belum sold out
    const activeTier = allTiers.find((t) => t.is_active && t.sold < t.quota);

    if (!activeTier) {
      return res.json({
        message: 'Semua presale habis',
        all_soldout: true,
        tiers: allTiers.map((t) => ({ ...t, is_soldout: true })),
      });
    }

    return res.json({
      tier: { ...activeTier, is_soldout: false, is_current_active: true },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/presale/event/:eventId/tiers
// Tambah tier presale baru
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
      [eventId, tier_name.trim(), tier_order, price, quota, is_active ? 1 : 0]
    );

    const [rows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({ message: 'Tier presale berhasil ditambahkan.', tier: (rows as any[])[0] });
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

    const updatedName     = tier_name  !== undefined ? tier_name.trim()     : current.tier_name;
    const updatedOrder    = tier_order !== undefined ? Number(tier_order)   : current.tier_order;
    const updatedPrice    = price      !== undefined ? Number(price)        : current.price;
    const updatedQuota    = quota      !== undefined ? Number(quota)        : current.quota;
    const updatedIsActive = is_active  !== undefined ? (is_active ? 1 : 0) : current.is_active;

    if (updatedName.trim() === '') {
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
// Proses penjualan tiket presale
// Body: { quantity: number }
// ─────────────────────────────────────────────────────────────────────────────
export const sellTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tierId } = req.params;
    const { quantity } = req.body;

    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ message: 'quantity harus lebih dari 0.' });
    }
    const qty = Number(quantity);

    const [rows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    const tierRows = rows as any[];
    if (tierRows.length === 0) {
      return res.status(404).json({ message: 'Tier presale tidak ditemukan.' });
    }

    const tier = tierRows[0];
    const remaining = tier.quota - tier.sold;

    if (tier.sold + qty > tier.quota) {
      return res.status(409).json({
        message: 'Kuota presale ini tidak mencukupi.',
        remaining,
      });
    }

    await pool.query(
      'UPDATE event_presale_tiers SET sold = sold + ? WHERE id = ?',
      [qty, tierId]
    );

    const [updatedRows]: any = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    const updatedTier = (updatedRows as any[])[0];

    // Cari next_tier jika tier ini baru saja habis
    let next_tier = null;
    if (updatedTier.sold >= updatedTier.quota) {
      const [nextRows]: any = await pool.query(
        `SELECT * FROM event_presale_tiers
         WHERE event_id = ? AND tier_order > ? AND is_active = 1
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
    next(err);
  }
};
