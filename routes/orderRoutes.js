'use strict';

const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// GET /api/orders — Ambil semua pesanan
router.get('/', orderController.getAllOrders);

// POST /api/orders — Buat pesanan baru
router.post('/', orderController.createOrder);

// PUT /api/orders/:id/status — Update status pesanan
router.put('/:id/status', orderController.updateOrderStatus);

module.exports = router;

