import pool from '../config/db';

export interface PresaleTier {
  id: number;
  event_id: number;
  tier_name: string;
  tier_order: number;
  price: number;
  quota: number;
  sold: number;
  remaining: number;
  is_active: number | boolean;
  is_soldout: boolean;
  is_current_active: boolean;
}

export interface EventTiersResult {
  activeTier: PresaleTier | null;
  allTiers: PresaleTier[];
  allSoldOut: boolean;
  activePrice: number;
  activeQuota: number;
  activeRemaining: number;
  currentTierName: string;
}

/**
 * Pastikan 3 tier baku (Presale 1, Presale 2, Reguler) dibuat jika event belum memiliki tier.
 */
export async function ensureDefaultTiers(
  connOrPool: any,
  eventId: number | string,
  basePrice = 0,
  totalQuota = 50,
  bookedCount = 0
): Promise<void> {
  try {
    const [existing]: any = await connOrPool.query(
      'SELECT id FROM event_presale_tiers WHERE event_id = ?',
      [eventId]
    );

    if (existing && existing.length > 0) return;

    const price = Math.max(0, Number(basePrice) || 0);
    const quota = Math.max(10, Number(totalQuota) || 50);
    const booked = Math.max(0, Number(bookedCount) || 0);

    // Alokasi kuota per tier
    const quotaP1 = Math.max(5, Math.floor(quota * 0.25));
    const quotaP2 = Math.max(5, Math.floor(quota * 0.35));
    const quotaReg = Math.max(1, quota - quotaP1 - quotaP2);

    // Alokasi harga berjenjang (Presale 1: 70%, Presale 2: 85%, Reguler: 100%)
    const priceP1 = Math.round(price * 0.7);
    const priceP2 = Math.round(price * 0.85);
    const priceReg = price;

    // Alokasi sold yang sudah tercatat sebelumnya
    const soldP1 = Math.min(quotaP1, booked);
    const remainingAfterP1 = Math.max(0, booked - quotaP1);
    const soldP2 = Math.min(quotaP2, remainingAfterP1);
    const soldReg = Math.min(quotaReg, Math.max(0, remainingAfterP1 - quotaP2));

    await connOrPool.query(
      `INSERT INTO event_presale_tiers (event_id, tier_name, tier_order, price, quota, sold, is_active)
       VALUES 
       (?, 'Presale 1', 1, ?, ?, ?, 1),
       (?, 'Presale 2', 2, ?, ?, ?, 1),
       (?, 'Reguler', 3, ?, ?, ?, 1)`,
      [
        eventId, priceP1, quotaP1, soldP1,
        eventId, priceP2, quotaP2, soldP2,
        eventId, priceReg, quotaReg, soldReg,
      ]
    );
  } catch (err: any) {
    console.warn(`[ensureDefaultTiers] Gagal inisialisasi default tier event ${eventId}:`, err.message);
  }
}

/**
 * Logika penentuan tier aktif otomatis secara berurutan:
 * 1. Presale 1 jika sisa kuota Presale 1 > 0
 * 2. Presale 2 jika sisa kuota Presale 1 = 0 dan Presale 2 > 0
 * 3. Reguler jika sisa kuota Presale 1 & 2 = 0 dan Reguler > 0
 * 4. Habis / Sold Out jika semua kuota = 0
 */
export async function getEventTiersWithActive(
  connOrPool: any = pool,
  eventId: number | string,
  options?: { forUpdate?: boolean; defaultPrice?: number; defaultQuota?: number }
): Promise<EventTiersResult> {
  const querySql = `
    SELECT id, event_id, tier_name, tier_order, price, quota, sold, is_active
    FROM event_presale_tiers
    WHERE event_id = ?
    ORDER BY tier_order ASC, id ASC
    ${options?.forUpdate ? 'FOR UPDATE' : ''}
  `;

  let [rows]: any = await connOrPool.query(querySql, [eventId]);

  // Jika belum ada tier, inisialisasi default tier
  if (!rows || rows.length === 0) {
    let basePrice = options?.defaultPrice ?? 0;
    let baseQuota = options?.defaultQuota ?? 50;
    let bookedCount = 0;

    try {
      const [evRows]: any = await connOrPool.query(
        'SELECT price, quota, booked_count, sold FROM events WHERE id = ?',
        [eventId]
      );
      if (evRows && evRows.length > 0) {
        basePrice = Number(evRows[0].price) || basePrice;
        baseQuota = Number(evRows[0].quota) || baseQuota;
        bookedCount = Number(evRows[0].booked_count ?? evRows[0].sold ?? 0);
      }
    } catch (_) {}

    await ensureDefaultTiers(connOrPool, eventId, basePrice, baseQuota, bookedCount);
    const [newRows]: any = await connOrPool.query(querySql, [eventId]);
    rows = newRows || [];
  }

  // Hitung remaining & cari tier aktif pertama (Presale 1 -> Presale 2 -> Reguler)
  const tiersWithRemaining = (rows as any[]).map((t) => {
    const quota = Number(t.quota) || 0;
    const sold = Number(t.sold) || 0;
    const remaining = Math.max(0, quota - sold);
    const isSoldOut = quota > 0 && remaining <= 0;
    return {
      id: Number(t.id),
      event_id: Number(t.event_id),
      tier_name: String(t.tier_name),
      tier_order: Number(t.tier_order) || 1,
      price: Number(t.price) || 0,
      quota,
      sold,
      remaining,
      is_active: t.is_active === 1 || t.is_active === true,
      is_soldout: isSoldOut,
      is_current_active: false,
    };
  });

  // Urutan seleksi berurutan: tier aktif paling awal yang remaining > 0
  const active = tiersWithRemaining.find((t) => t.is_active && t.remaining > 0) || null;

  const allTiers = tiersWithRemaining.map((t) => ({
    ...t,
    is_current_active: active ? t.id === active.id : false,
  }));

  const allSoldOut = !active;
  const currentTierName = active ? active.tier_name : 'Habis / Sold Out';
  const activePrice = active ? active.price : (allTiers[allTiers.length - 1]?.price || 0);
  const activeQuota = active ? active.quota : 0;
  const activeRemaining = active ? active.remaining : 0;

  return {
    activeTier: active ? { ...active, is_current_active: true } : null,
    allTiers,
    allSoldOut,
    activePrice,
    activeQuota,
    activeRemaining,
    currentTierName,
  };
}

/**
 * Lock row dan dapatkan tier aktif di dalam transaksi DB
 */
export async function lockAndGetActiveTier(
  conn: any,
  eventId: number | string
): Promise<EventTiersResult> {
  return getEventTiersWithActive(conn, eventId, { forUpdate: true });
}

/**
 * Potong kuota tier aktif dan sinkronkan booked_count pada tabel events
 */
export async function deductTierQuota(
  conn: any,
  tierId: number | string,
  eventId: number | string,
  quantity: number
): Promise<{ success: boolean; tier: any; remaining: number }> {
  const qty = Math.max(1, Number(quantity) || 1);

  // Ambil dan kunci tier
  const [tierRows]: any = await conn.query(
    'SELECT * FROM event_presale_tiers WHERE id = ? FOR UPDATE',
    [tierId]
  );
  if (!tierRows || tierRows.length === 0) {
    throw new Error('Tier tiket tidak ditemukan.');
  }

  const tier = tierRows[0];
  const quota = Number(tier.quota) || 0;
  const sold = Number(tier.sold) || 0;
  const remaining = Math.max(0, quota - sold);

  if (sold + qty > quota) {
    throw new Error(`Sisa kuota tier ${tier.tier_name} tidak mencukupi (sisa: ${remaining}, diminta: ${qty}).`);
  }

  const newTierSold = sold + qty;
  await conn.query(
    'UPDATE event_presale_tiers SET sold = ? WHERE id = ?',
    [newTierSold, tierId]
  );

  // Sinkronkan ke tabel events
  const [evRows]: any = await conn.query(
    'SELECT quota, booked_count, sold FROM events WHERE id = ? FOR UPDATE',
    [eventId]
  );
  if (evRows && evRows.length > 0) {
    const evQuota = Number(evRows[0].quota) || 0;
    const newBooked = Number(evRows[0].booked_count ?? evRows[0].sold ?? 0) + qty;
    const newStatus = evQuota > 0 && newBooked >= evQuota ? 'Tiket Penuh' : 'Tiket Tersedia';
    await conn.query(
      'UPDATE events SET booked_count = ?, sold = ?, status = ? WHERE id = ?',
      [newBooked, newBooked, newStatus, eventId]
    );
  }

  return {
    success: true,
    tier: { ...tier, sold: newTierSold },
    remaining: Math.max(0, quota - newTierSold),
  };
}

/**
 * Kembalikan kuota tier dan event saat transaksi dibatalkan atau kedaluwarsa
 */
export async function refundTierQuota(
  connOrPool: any,
  tierId: number | string | null,
  eventId: number | string,
  quantity: number
): Promise<void> {
  const qty = Math.max(1, Number(quantity) || 1);

  try {
    if (tierId) {
      await connOrPool.query(
        'UPDATE event_presale_tiers SET sold = GREATEST(0, sold - ?) WHERE id = ?',
        [qty, tierId]
      );
    }

    // Kembalikan booked_count di events
    await connOrPool.query(
      `UPDATE events 
       SET booked_count = GREATEST(0, booked_count - ?),
           sold = GREATEST(0, sold - ?),
           status = 'Tiket Tersedia'
       WHERE id = ?`,
      [qty, qty, eventId]
    );
  } catch (err: any) {
    console.error(`[refundTierQuota] Gagal mengembalikan kuota event ${eventId} tier ${tierId}:`, err.message);
  }
}
