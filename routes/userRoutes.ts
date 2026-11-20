import express from 'express';
import {
  getUsers,
  verifyUser,
  deleteUser,
} from '../controllers/userController';

const router = express.Router();

// GET /api/users & GET /api/members — Daftar member komunitas (role = 'user')
router.get('/', getUsers);

// PATCH /api/users/:id/verify & PATCH /api/members/:id/verify — Verifikasi member
router.patch('/:id/verify', verifyUser);

// DELETE /api/users/:id & DELETE /api/members/:id — Hapus member
router.delete('/:id', deleteUser);

export default router;
module.exports = router;
