const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: tandai tier mana yang sedang aktif (paling awal & belum sold out)
// ─────────────────────────────────────────────────────────────────────────────
function markCurrentActive(tiers) {
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
exports.getTiersByEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM event_presale_tiers
       WHERE event_id = ?
       ORDER BY tier_order ASC`,
      [eventId]
    );

    const tiers = markCurrentActive(rows);
    return res.json({ tiers });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/presale/event/:eventId/active
// Tier presale aktif yang sekarang berlaku (terendah tier_order, belum soldout)
// ─────────────────────────────────────────────────────────────────────────────
exports.getActiveTier = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Ambil semua tier event ini
    const [all] = await pool.query(
      `SELECT * FROM event_presale_tiers
       WHERE event_id = ?
       ORDER BY tier_order ASC`,
      [eventId]
    );

    if (all.length === 0) {
      return res.status(404).json({ message: 'Tidak ada tier presale untuk event ini.' });
    }

    // Cari tier aktif paling awal yang belum sold out
    const activeTier = all.find((t) => t.is_active && t.sold < t.quota);

    if (!activeTier) {
      // Semua habis
      return res.json({
        message: 'Semua presale habis',
        all_soldout: true,
        tiers: all.map((t) => ({ ...t, is_soldout: true })),
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
exports.createTier = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { tier_name, tier_order = 1, price = 0, quota, is_active = 1 } = req.body;

    // Validasi
    if (!tier_name || typeof tier_name !== 'string' || tier_name.trim() === '') {
      return res.status(400).json({ message: 'tier_name wajib diisi.' });
    }
    if (!quota || Number(quota) <= 0) {
      return res.status(400).json({ message: 'quota harus lebih dari 0.' });
    }

    const [result] = await pool.query(
      `INSERT INTO event_presale_tiers
         (event_id, tier_name, tier_order, price, quota, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, tier_name.trim(), tier_order, price, quota, is_active ? 1 : 0]
    );

    const [rows] = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({ message: 'Tier presale berhasil ditambahkan.', tier: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/presale/tiers/:tierId
// Update tier (quota, harga, nama, is_active, dll)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateTier = async (req, res, next) => {
  try {
    const { tierId } = req.params;
    const { tier_name, tier_order, price, quota, is_active } = req.body;

    // Pastikan tier ada
    const [existing] = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Tier presale tidak ditemukan.' });
    }

    const current = existing[0];

    // Gunakan nilai lama jika field tidak disertakan
    const updatedName      = tier_name  !== undefined ? tier_name.trim()      : current.tier_name;
    const updatedOrder     = tier_order !== undefined ? Number(tier_order)    : current.tier_order;
    const updatedPrice     = price      !== undefined ? Number(price)         : current.price;
    const updatedQuota     = quota      !== undefined ? Number(quota)         : current.quota;
    const updatedIsActive  = is_active  !== undefined ? (is_active ? 1 : 0)  : current.is_active;

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

    const [updated] = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );

    return res.json({ message: 'Tier presale berhasil diperbarui.', tier: updated[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/presale/tiers/:tierId
// Hapus tier presale
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteTier = async (req, res, next) => {
  try {
    const { tierId } = req.params;

    const [existing] = await pool.query(
      'SELECT id FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    if (existing.length === 0) {
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
exports.sellTier = async (req, res, next) => {
  try {
    const { tierId } = req.params;
    const { quantity } = req.body;

    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ message: 'quantity harus lebih dari 0.' });
    }
    const qty = Number(quantity);

    // 1. Ambil tier
    const [rows] = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Tier presale tidak ditemukan.' });
    }

    const tier = rows[0];
    const remaining = tier.quota - tier.sold;

    // 2. Cek kuota
    if (tier.sold + qty > tier.quota) {
      return res.status(409).json({
        message: 'Kuota presale ini tidak mencukupi.',
        remaining,
      });
    }

    // 3. Update sold
    await pool.query(
      'UPDATE event_presale_tiers SET sold = sold + ? WHERE id = ?',
      [qty, tierId]
    );

    // 4. Ambil data terbaru
    const [updatedRows] = await pool.query(
      'SELECT * FROM event_presale_tiers WHERE id = ?',
      [tierId]
    );
    const updatedTier = updatedRows[0];

    // 5. Cari next_tier (tier berikutnya dari event yang sama, berdasarkan tier_order)
    let next_tier = null;
    if (updatedTier.sold >= updatedTier.quota) {
      // Tier ini baru saja habis — cari tier berikutnya
      const [nextRows] = await pool.query(
        `SELECT * FROM event_presale_tiers
         WHERE event_id = ? AND tier_order > ? AND is_active = 1
         ORDER BY tier_order ASC
         LIMIT 1`,
        [updatedTier.event_id, updatedTier.tier_order]
      );
      if (nextRows.length > 0) {
        next_tier = nextRows[0];
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
