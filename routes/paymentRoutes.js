'use strict';

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// POST /api/payment/charge — Buat Snap transaction (token & redirect_url)
router.post('/charge', paymentController.createCharge);

// POST /api/payment/notification — Webhook Midtrans callback
router.post('/notification', paymentController.handleNotification);

// GET /api/payment/status/:orderId — Cek status pembayaran dan sinkronkan dengan database
router.get('/status/:orderId', paymentController.checkStatus);

module.exports = router;

