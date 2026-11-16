const express = require('express');
const router = express.Router();
const {
  getAllCoupons,
  createCoupon,
  deleteCoupon,
} = require('../controllers/couponController');

router.get('/', getAllCoupons);
router.post('/', createCoupon);
router.delete('/:id', deleteCoupon);

module.exports = router;
