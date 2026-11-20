const express = require('express');
const router = express.Router();
const controller = require('../controllers/kedaiController');

router.get('/orders', controller.getOrders);
router.post('/orders', controller.createOrder);
router.patch('/orders/:id/status', controller.updateStatus);
router.patch('/orders/:id/pay', controller.confirmPayment);
router.delete('/orders/:id', controller.deleteOrder);

module.exports = router;
