import express from 'express';
import { optionalVerifyToken } from '../middleware/authMiddleware';
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  patchEventStatus,
  bookEvent,
  deleteEvent,
  createWorkshopProposal,
  approveEvent,
  rejectEvent,
  cancelEventTicket,
} from '../controllers/eventController';

const router = express.Router();

// REST API Agenda / Events
router.get('/', getAllEvents);
router.post('/workshop-proposal', optionalVerifyToken, createWorkshopProposal);
router.put('/:id/approve', approveEvent);
router.put('/:id/reject', rejectEvent);
router.get('/:id', getEventById);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.patch('/:id/status', patchEventStatus);  // Admin: toggle Tiket Tersedia/Penuh
router.post('/:id/book', bookEvent);            // Mobile: pesan tiket (kunci tier & potong kuota)
router.post('/tickets/:orderId/cancel', cancelEventTicket); // Batalkan tiket & kembalikan kuota
router.post('/:id/cancel', cancelEventTicket);
router.delete('/:id', deleteEvent);

export default router;
