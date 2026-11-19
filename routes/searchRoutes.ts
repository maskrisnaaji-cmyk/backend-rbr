import express from 'express';
import { searchGlobal } from '../controllers/searchController';

const router = express.Router();

// GET /api/search?q=...
router.get('/', searchGlobal);

export default router;
module.exports = router;
