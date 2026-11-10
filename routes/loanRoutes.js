const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getMyLoans, requestExtension, getAllLoans, updateLoan } = require('../controllers/loanController');

router.get('/my', verifyToken, getMyLoans);
router.post('/extension', verifyToken, requestExtension);
// Endpoint operasional admin. Frontend admin saat ini memakai API internal tanpa sesi JWT.
router.get('/', getAllLoans);
router.put('/:id', updateLoan);

module.exports = router;
