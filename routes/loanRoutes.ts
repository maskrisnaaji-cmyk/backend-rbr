import express from 'express';
import { verifyToken, optionalVerifyToken } from '../middleware/authMiddleware';
import {
  getMyLoans,
  requestLoan,
  requestExtension,
  getAllLoans,
  updateLoan,
  syncLoansStatus,
} from '../controllers/loanController';

const router = express.Router();

router.all('/sync', syncLoansStatus);
router.get('/my', verifyToken, getMyLoans);
router.post('/request', optionalVerifyToken, requestLoan);
router.post('/extension', verifyToken, requestExtension);
// Endpoint operasional admin. Frontend admin saat ini memakai API internal tanpa sesi JWT.
router.get('/', getAllLoans);
router.put('/:id', updateLoan);

export default router;
module.exports = router;
