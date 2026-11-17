const express = require('express');
const router = express.Router();
const {
  getAllMenus,
  getMenuById,
  createMenu,
  updateMenu,
  patchMenuStatus,
  deleteMenu,
} = require('../controllers/menuController');

// REST API Menu Kedai Kopi
router.get('/', getAllMenus);
router.get('/:id', getMenuById);
router.post('/', createMenu);
router.put('/:id', updateMenu);
router.patch('/:id', patchMenuStatus);
router.patch('/:id/status', patchMenuStatus);
router.delete('/:id', deleteMenu);

module.exports = router;
