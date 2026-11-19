import express from 'express';
import {
  getAllMenus,
  getMenuById,
  createMenu,
  updateMenu,
  patchMenuStatus,
  deleteMenu,
} from '../controllers/menuController';

const router = express.Router();

// REST API Menu Kedai Kopi
router.get('/', getAllMenus);
router.get('/:id', getMenuById);
router.post('/', createMenu);
router.put('/:id', updateMenu);
router.patch('/:id', patchMenuStatus);
router.patch('/:id/status', patchMenuStatus);
router.delete('/:id', deleteMenu);

export default router;
module.exports = router;
