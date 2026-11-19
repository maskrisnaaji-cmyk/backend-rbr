'use strict';

const express = require('express');
const router = express.Router();
const {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  patchEventStatus,
  bookEvent,
  deleteEvent,
} = require('../controllers/eventController');

// REST API Agenda / Events
router.get('/', getAllEvents);
router.get('/:id', getEventById);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.patch('/:id/status', patchEventStatus);  // Admin: toggle Tiket Tersedia/Penuh
router.post('/:id/book', bookEvent);            // Mobile: pesan tiket (tambah booked_count)
router.delete('/:id', deleteEvent);

module.exports = router;
