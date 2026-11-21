import express from 'express';
import {
  getAllCoupons,
  createCoupon,
  deleteCoupon,
} from '../controllers/couponController';

const router = express.Router();

router.get('/', getAllCoupons);
router.post('/', createCoupon);
router.delete('/:id', deleteCoupon);

export default router;
module.exports = router;
