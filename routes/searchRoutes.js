const express = require('express');
const router = express.Router();
const { searchGlobal } = require('../controllers/searchController');

// GET /api/search?q=...
router.get('/', searchGlobal);

module.exports = router;

