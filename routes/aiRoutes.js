'use strict';

/**
 * aiRoutes.js — Route Chatbot Kurator Budaya
 * Prefix  : /api/ai  (didaftarkan di index.js)
 * Endpoint: POST /api/ai/chat
 */

const express = require('express');
const { handleChatbotQuery } = require('../controllers/aiController');

const router = express.Router();

// Batasi body size untuk endpoint AI agar tidak overload
router.use(express.json({ limit: '32kb' }));

/**
 * POST /api/ai/chat
 * Body : { message: string, user_id?: number }
 * Res  : { success: boolean, data: { reply_message, category, related_info } }
 */
router.post('/chat', handleChatbotQuery);

module.exports = router;

