import express from 'express';
import * as notificationController from '../controllers/notificationController';
import { optionalVerifyToken } from '../middleware/authMiddleware';

const router = express.Router();

// GET /api/notifications — Ambil notifikasi (filter per user_id jika token tersedia)
router.get('/', optionalVerifyToken, notificationController.getAllNotifications);

// POST /api/notifications — Tambah notifikasi baru
router.post('/', notificationController.createNotification);

// PUT/PATCH /api/notifications/read-all — Tandai semua dibaca (filter per user jika token ada)
router.put('/read-all', optionalVerifyToken, notificationController.markAllAsRead);
router.patch('/read-all', optionalVerifyToken, notificationController.markAllAsRead);

// PUT/PATCH /api/notifications/:id/read — Tandai satu dibaca
router.put('/:id/read', notificationController.markAsRead);
router.patch('/:id/read', notificationController.markAsRead);

// POST /api/notifications/simulate — Simulasi status order real-time
router.post('/simulate', notificationController.simulateOrderProgression);

export default router;
module.exports = router;
