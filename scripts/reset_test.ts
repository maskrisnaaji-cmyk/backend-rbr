import mysql from 'mysql2/promise';

(async () => {
  const p = await mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'rumah_budaya_ratna' });
  await p.query("UPDATE events SET booked_count=14, sold=14, status='Tiket Tersedia' WHERE id=5");
  await p.query("DELETE FROM ticket_transactions WHERE order_id='TEST-BOOK-001'");
  console.log('OK: data test direset');
  await p.end();
})();
