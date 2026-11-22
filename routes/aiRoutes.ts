import express from 'express';
import { handleChatbotQuery } from '../controllers/aiController';

const router = express.Router();

// Batasi body size untuk endpoint AI agar tidak overload
router.use(express.json({ limit: '32kb' }));

/**
 * POST /api/ai/chat
 * Body : { message: string, user_id?: number }
 * Res  : { success: boolean, data: { reply_message, category, related_info } }
 */
router.post('/chat', handleChatbotQuery);

export default router;
module.exports = router;
