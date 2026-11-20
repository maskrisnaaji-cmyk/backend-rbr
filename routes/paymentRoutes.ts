import express from 'express';
import * as paymentController from '../controllers/paymentController';

const router = express.Router();

// POST /api/payment/charge — Core API payment charge (QRIS / Bank Transfer VA)
router.post('/charge', paymentController.createCharge);

// POST /api/payment/transaction, /create-transaction, /snap — Snap transaction (token & redirect_url)
router.post('/transaction', paymentController.createTransaction);
router.post('/create-transaction', paymentController.createTransaction);
router.post('/snap', paymentController.createTransaction);

// POST /api/payment/notification — Webhook Midtrans callback
router.post('/notification', paymentController.handleNotification);

// GET /api/payment/status/:orderId — Cek status pembayaran dan sinkronkan dengan database
router.get('/status/:orderId', paymentController.checkStatus);

export default router;
module.exports = router;
