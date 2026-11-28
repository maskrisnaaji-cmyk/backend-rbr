import express from 'express';
import {
  getTiersByEvent,
  getActiveTier,
  createTier,
  updateTier,
  deleteTier,
  sellTier,
  refundTier,
  cancelTicketOrder,
} from '../controllers/presaleController';

const router = express.Router();

// ── Semua tier untuk 1 event ──────────────────────────────────────────────
// GET /api/presale/event/:eventId
router.get('/event/:eventId', getTiersByEvent);

// ── Tier aktif saat ini untuk 1 event ────────────────────────────────────
// GET /api/presale/event/:eventId/active
router.get('/event/:eventId/active', getActiveTier);

// ── Tambah tier baru ke sebuah event ─────────────────────────────────────
// POST /api/presale/event/:eventId/tiers
router.post('/event/:eventId/tiers', createTier);

// ── Update tier ───────────────────────────────────────────────────────────
// PUT /api/presale/tiers/:tierId
router.put('/tiers/:tierId', updateTier);

// ── Hapus tier ────────────────────────────────────────────────────────────
// DELETE /api/presale/tiers/:tierId
router.delete('/tiers/:tierId', deleteTier);

// ── Proses penjualan tiket presale ────────────────────────────────────────
// POST /api/presale/tiers/:tierId/sell
router.post('/tiers/:tierId/sell', sellTier);

// ── Kembalikan kuota tier ─────────────────────────────────────────────────
// POST /api/presale/tiers/:tierId/refund
router.post('/tiers/:tierId/refund', refundTier);

// ── Batalkan tiket dan kembalikan kuota tier ──────────────────────────────
// POST /api/presale/tickets/:orderId/cancel
router.post('/tickets/:orderId/cancel', cancelTicketOrder);

export default router;
