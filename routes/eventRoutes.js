const express = require('express');
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  createWorkshopProposal,
  approveEvent,
  rejectEvent,
} = require('../controllers/eventController');

// REST API Agenda / Events
router.get('/', getAllEvents);
router.post('/workshop-proposal', createWorkshopProposal);
router.put('/:id/approve', approveEvent);
router.put('/:id/reject', rejectEvent);
router.get('/:id', getEventById);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
