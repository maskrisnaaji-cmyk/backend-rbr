import express from 'express';
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  patchEventStatus,
  bookEvent,
  deleteEvent,
} from '../controllers/eventController';

const router = express.Router();

// REST API Agenda / Events
router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.patch('/:id/status', patchEventStatus);  // Admin: toggle Tiket Tersedia/Penuh
router.post('/:id/book', bookEvent);            // Mobile: pesan tiket (tambah booked_count)
router.delete('/:id', deleteEvent);

export default router;
module.exports = router;
