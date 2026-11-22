const express  = require('express');
const router   = express.Router();
const presaleController = require('../controllers/presaleController');

// ── Semua tier untuk 1 event ──────────────────────────────────────────────
// GET /api/presale/event/:eventId
router.get('/event/:eventId', presaleController.getTiersByEvent);

// ── Tier aktif saat ini untuk 1 event ────────────────────────────────────
// GET /api/presale/event/:eventId/active
router.get('/event/:eventId/active', presaleController.getActiveTier);

// ── Tambah tier baru ke sebuah event ─────────────────────────────────────
// POST /api/presale/event/:eventId/tiers
router.post('/event/:eventId/tiers', presaleController.createTier);

// ── Update tier ───────────────────────────────────────────────────────────
// PUT /api/presale/tiers/:tierId
router.put('/tiers/:tierId', presaleController.updateTier);

// ── Hapus tier ────────────────────────────────────────────────────────────
// DELETE /api/presale/tiers/:tierId
router.delete('/tiers/:tierId', presaleController.deleteTier);

// ── Proses penjualan tiket presale ────────────────────────────────────────
// POST /api/presale/tiers/:tierId/sell
router.post('/tiers/:tierId/sell', presaleController.sellTier);

module.exports = router;
