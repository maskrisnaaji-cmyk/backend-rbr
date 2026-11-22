'use strict';

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import mysql from 'mysql2/promise';

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rumah_budaya_ratna',
  });

  // 1. Tambah kolom booked_count jika belum ada
  try {
    await pool.query('ALTER TABLE events ADD COLUMN booked_count INT NOT NULL DEFAULT 0 AFTER sold');
    console.log('OK: kolom booked_count ditambahkan ke tabel events');
  } catch (e: any) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP: kolom booked_count sudah ada');
    } else {
      throw e;
    }
  }

  // 2. Sinkron booked_count dari sold (untuk data lama)
  const [syncResult]: any = await pool.query(
    'UPDATE events SET booked_count = sold WHERE booked_count != sold'
  );
  console.log(`OK: booked_count disinkronkan (${syncResult.affectedRows} baris)`);

  // 3. Migrasi nilai status lama ke format baru
  await pool.query(
    "UPDATE events SET status = 'Tiket Tersedia' WHERE status IN ('Aktif', 'Tersedia', 'Buka', 'Active', 'aktif')"
  );
  await pool.query(
    "UPDATE events SET status = 'Tiket Penuh' WHERE status IN ('Penuh', 'Habis', 'Full', 'Sold Out', 'Tiket Habis', 'sold_out')"
  );
  console.log('OK: nilai status lama dimigrasi ke Tiket Tersedia / Tiket Penuh');

  // 4. Auto-enforce Tiket Penuh jika booked_count >= quota
  const [fullResult]: any = await pool.query(
    "UPDATE events SET status = 'Tiket Penuh' WHERE booked_count >= quota AND quota > 0"
  );
  console.log(`OK: Tiket Penuh di-enforce otomatis (${fullResult.affectedRows} event)`);

  // 5. Auto-restore Tiket Tersedia jika booked_count < quota tapi masih Tiket Penuh (admin reset)
  const [openResult]: any = await pool.query(
    "UPDATE events SET status = 'Tiket Tersedia' WHERE booked_count < quota AND status NOT IN ('Tiket Tersedia', 'Tiket Penuh')"
  );
  console.log(`OK: Status netral dikonversi ke Tiket Tersedia (${openResult.affectedRows} event)`);

  // 6. Tambah kolom quantity ke ticket_transactions jika belum ada
  try {
    await pool.query(
      'ALTER TABLE ticket_transactions ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER amount'
    );
    console.log('OK: kolom quantity ditambahkan ke ticket_transactions');
  } catch (e: any) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP: kolom quantity sudah ada di ticket_transactions');
    } else {
      throw e;
    }
  }

  // Verifikasi akhir
  const [rows]: any = await pool.query(
    'SELECT id, title, quota, sold, booked_count, status FROM events ORDER BY id'
  );
  console.log('\n=== Kondisi events setelah migrasi ===');
  rows.forEach((r: any) => console.log(JSON.stringify(r)));

  await pool.end();
  console.log('\nMigrasi selesai!');
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
