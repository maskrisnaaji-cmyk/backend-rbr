'use strict';

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// GET /api/kedai/orders & /api/orders — Ambil semua antrean pesanan (hanya PAID)
router.get('/', orderController.getAllOrders);

// GET /api/kedai/orders/:id & /api/orders/:id — Ambil satu pesanan
router.get('/:id', orderController.getOrderById);

// POST /api/kedai/orders & /api/orders — Buat pesanan baru (status awal UNPAID, order_status Menunggu)
router.post('/', orderController.createOrder);

// PATCH /api/kedai/orders/:id/pay & /api/orders/:id/pay — Pelunasan pesanan (payment_status PAID, order_status Disiapkan)
router.patch('/:id/pay', orderController.payOrder);

// PATCH / PUT /api/kedai/orders/:id/status & /api/orders/:id/status — Update status pesanan
router.patch('/:id/status', orderController.updateOrderStatus);
router.put('/:id/status', orderController.updateOrderStatus);

// DELETE /api/kedai/orders/:id & /api/orders/:id — Hapus pesanan
router.delete('/:id', orderController.deleteOrder);

module.exports = router;
