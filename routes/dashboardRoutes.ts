import express from 'express';
import {
  getDashboardSummary,
  getKPIsOnly,
  getChartDataOnly,
} from '../controllers/dashboardController';

const router = express.Router();

// GET /api/dashboard & GET /api/dashboard/summary — Ringkasan metrik, grafik, dan feed dashboard
router.get('/', getDashboardSummary);
router.get('/summary', getDashboardSummary);

// Endpoint granular opsional
router.get('/kpis', getKPIsOnly);
router.get('/chart', getChartDataOnly);

export default router;
module.exports = router;
