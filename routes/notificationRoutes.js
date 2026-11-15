'use strict';

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

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

module.exports = router;

