import express from 'express';
import * as notificationController from '../controllers/notificationController';

const router = express.Router();

// GET /api/notifications — Ambil semua notifikasi
router.get('/', notificationController.getAllNotifications);

// POST /api/notifications — Tambah notifikasi baru
router.post('/', notificationController.createNotification);

// PUT /api/notifications/read-all — Tandai semua dibaca
router.put('/read-all', notificationController.markAllAsRead);

// PUT /api/notifications/:id/read — Tandai satu dibaca
router.put('/:id/read', notificationController.markAsRead);

// POST /api/notifications/simulate — Simulasi status order real-time
router.post('/simulate', notificationController.simulateOrderProgression);

export default router;
module.exports = router;
