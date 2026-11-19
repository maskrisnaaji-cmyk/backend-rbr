import 'dotenv/config';
import pool from './config/db';

async function clean() {
  const [res]: any = await pool.query("UPDATE books SET cover_image = '' WHERE cover_image LIKE 'blob:%'");
  console.log('Cleaned blob URLs from books:', res.affectedRows);
  process.exit(0);
}
clean().catch((e) => { console.error(e); process.exit(1); });
