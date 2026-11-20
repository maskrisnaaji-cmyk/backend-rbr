import { Request, Response } from 'express';
import {
  getDashboardKPIs,
  getDashboardChartData,
  getActiveOrdersFeed,
  getEventOccupancyFeed,
} from '../models/dashboardModel';

/**
 * GET /api/dashboard/summary
 * Mengambil seluruh ringkasan agregasi real-time untuk Dashboard Admin:
 * - 4 Metrik KPI Utama (kedaiRevenue, ticketsSold, borrowedBooks, totalMembers)
 * - Data Grafik Omset (chartData & totalChartOmset sesuai filter ?range=7d|month|year)
 * - Live Feed Bawah (activeOrders & eventOccupancy)
 */
export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const range = String(req.query.range || 'month').toLowerCase();

    // Jalankan seluruh query agregasi secara paralel demi performa maksimal
    const [kpis, chart, activeOrders, eventOccupancy] = await Promise.all([
      getDashboardKPIs(),
      getDashboardChartData(range),
      getActiveOrdersFeed(),
      getEventOccupancyFeed(),
    ]);

    const responsePayload = {
      kedaiRevenue: kpis.kedaiRevenue,
      ticketsSold: kpis.ticketsSold,
      borrowedBooks: kpis.borrowedBooks,
      totalMembers: kpis.totalMembers,
      range: chart.range,
      totalChartOmset: chart.totalChartOmset,
      totalChartOmsetFormatted: chart.totalChartOmsetFormatted,
      chartData: chart.chartData,
      activeOrders,
      eventOccupancy,
    };

    return res.status(200).json({
      success: true,
      message: 'Data ringkasan dashboard real-time berhasil dimuat',
      data: responsePayload,
      // Dukung akses langsung di root objek untuk kenyamanan frontend client
      ...responsePayload,
    });
  } catch (err: any) {
    console.error('[DashboardController] getDashboardSummary error:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal memuat ringkasan data dashboard.',
      error: process.env.NODE_ENV !== 'production' ? err.message : undefined,
    });
  }
};

/**
 * GET /api/dashboard/kpis
 * Mengambil hanya 4 metrik KPI utama
 */
export const getKPIsOnly = async (_req: Request, res: Response) => {
  try {
    const kpis = await getDashboardKPIs();
    return res.status(200).json({
      success: true,
      data: kpis,
      ...kpis,
    });
  } catch (err: any) {
    console.error('[DashboardController] getKPIsOnly error:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal memuat data metrik KPI.',
    });
  }
};

/**
 * GET /api/dashboard/chart
 * Mengambil hanya data grafik omset dengan filter query ?range=7d|month|year
 */
export const getChartDataOnly = async (req: Request, res: Response) => {
  try {
    const range = String(req.query.range || 'month').toLowerCase();
    const chart = await getDashboardChartData(range);
    return res.status(200).json({
      success: true,
      data: chart,
      ...chart,
    });
  } catch (err: any) {
    console.error('[DashboardController] getChartDataOnly error:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal memuat data grafik omset.',
    });
  }
};
