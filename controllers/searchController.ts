import { Request, Response } from 'express';
import pool from '../config/db';

/**
 * GET /api/search?q=keyword
 * Universal / Global Search across Books, Menus, Events, Users, and Orders
 */
export const searchGlobal = async (req: Request, res: Response) => {
  try {
    const rawQuery = (req.query.q || req.query.query || req.query.search || '') as string;
    const q = rawQuery.trim();

    if (!q) {
      return res.json({
        status: 'success',
        query: '',
        total: 0,
        results: {
          books: [],
          menus: [],
          orders: [],
          events: [],
          users: [],
        },
      });
    }

    const keyword = `%${q}%`;

    // 1. Query Books (Pustaka)
    const booksQuery = `
      SELECT 
        id, 
        COALESCE(code, CONCAT('BK-', id)) AS code, 
        title, 
        author, 
        COALESCE(category, 'Sastra') AS category, 
        COALESCE(rack_location, 'Rak Utama') AS rack_location, 
        COALESCE(status, 'Tersedia') AS status, 
        COALESCE(year, '2024') AS year,
        cover_image,
        digital_url
      FROM books
      WHERE title LIKE ? 
         OR author LIKE ? 
         OR category LIKE ? 
         OR rack_location LIKE ? 
         OR code LIKE ?
      ORDER BY id ASC
      LIMIT 15
    `;

    // 2. Query Menus (Kedai)
    const menusQuery = `
      SELECT 
        id, 
        name, 
        category, 
        price, 
        description, 
        status, 
        is_available,
        image 
      FROM menus
      WHERE name LIKE ? 
         OR category LIKE ? 
         OR description LIKE ? 
         OR status LIKE ?
      ORDER BY id ASC
      LIMIT 15
    `;

    // 3. Query Events (Agenda & Tiket)
    const eventsQuery = `
      SELECT 
        id, 
        title, 
        date, 
        time, 
        location, 
        price, 
        quota, 
        sold, 
        status, 
        COALESCE(category, 'Budaya') AS category, 
        image 
      FROM events
      WHERE title LIKE ? 
         OR location LIKE ? 
         OR category LIKE ? 
         OR status LIKE ?
      ORDER BY id ASC
      LIMIT 15
    `;

    // 4. Query Users (Anggota / Member)
    const usersQuery = `
      SELECT 
        id, 
        name, 
        email, 
        phone, 
        role, 
        createdAt 
      FROM users
      WHERE name LIKE ? 
         OR email LIKE ? 
         OR phone LIKE ?
      ORDER BY id ASC
      LIMIT 15
    `;

    // 5. Query Orders (Pesanan Kedai - fallback jika tabel orders ada)
    const ordersQuery = `
      SELECT 
        id, 
        order_code,
        table_number, 
        items, 
        total_price,
        total, 
        payment_status,
        order_status,
        status, 
        time 
      FROM orders
      WHERE id LIKE ? 
         OR table_number LIKE ? 
         OR items LIKE ? 
         OR status LIKE ?
      ORDER BY id DESC
      LIMIT 15
    `;

    // Eksekusi query secara paralel dengan Promise.allSettled untuk ketahanan tinggi
    const [booksRes, menusRes, eventsRes, usersRes, ordersRes]: any[] = await Promise.allSettled([
      pool.query(booksQuery, [keyword, keyword, keyword, keyword, keyword]),
      pool.query(menusQuery, [keyword, keyword, keyword, keyword]),
      pool.query(eventsQuery, [keyword, keyword, keyword, keyword]),
      pool.query(usersQuery, [keyword, keyword, keyword]),
      pool.query(ordersQuery, [keyword, keyword, keyword, keyword]),
    ]);

    const books = booksRes.status === 'fulfilled' ? booksRes.value[0] : [];
    const rawMenus = menusRes.status === 'fulfilled' ? menusRes.value[0] : [];
    const menus = rawMenus.map((m: any) => ({
      ...m,
      is_available: m.is_available === undefined ? (m.status !== 'Habis') : Boolean(m.is_available),
    }));
    const events = eventsRes.status === 'fulfilled' ? eventsRes.value[0] : [];
    const users = usersRes.status === 'fulfilled' ? usersRes.value[0] : [];
    const rawOrders = ordersRes.status === 'fulfilled' ? ordersRes.value[0] : [];
    const orders = rawOrders.map((o: any) => ({
      ...o,
      order_code: o.order_code || o.id,
      total_price: Number(o.total_price) || Number(String(o.total || '0').replace(/[^0-9]/g, '')) || 0,
      payment_status: o.payment_status || 'UNPAID',
      order_status: o.order_status || (o.status === 'disiapkan' ? 'Disiapkan' : o.status === 'selesai' ? 'Selesai' : 'Menunggu'),
    }));

    const total = books.length + menus.length + events.length + users.length + orders.length;

    return res.json({
      status: 'success',
      query: q,
      total,
      results: {
        books,
        menus,
        orders,
        events,
        users,
      },
      categories: {
        books: {
          label: 'Buku / Pustaka',
          count: books.length,
          items: books,
        },
        kedai: {
          label: 'Menu Kedai & Pesanan',
          count: menus.length + orders.length,
          menus,
          orders,
        },
        events: {
          label: 'Agenda & Tiket',
          count: events.length,
          items: events,
        },
        users: {
          label: 'Anggota / Member',
          count: users.length,
          items: users,
        },
      },
    });
  } catch (err: any) {
    console.error('[searchGlobal] Error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal melakukan pencarian global.',
      error: err.message,
    });
  }
};

module.exports = { searchGlobal };
