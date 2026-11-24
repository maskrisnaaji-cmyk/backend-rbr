import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT) || 3306;
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'rumah_budaya_ratna';

  console.log(`🔌 Terhubung ke MySQL untuk seeding akun (${dbHost}:${dbPort})...`);

  // 1. Hubungkan langsung ke database target
  const connection = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  console.log(`✅ Terhubung ke database '${dbName}'.`);

  // 2. Akun bawaan (Admin & User Pengujian)
  const accounts = [
    { name: 'Admin RBR', email: 'admin@rbr.com', password: 'rumahbudayamalang', role: 'admin' },
    { name: 'User RBR',  email: 'user@rbr.com',  password: 'user123',           role: 'user'  },
  ];

  for (const account of accounts) {
    const hashedPassword = await bcrypt.hash(account.password, 10);

    // Cek apakah akun sudah ada di database
    const [rows]: any = await connection.query(
      'SELECT id, role FROM users WHERE email = ?',
      [account.email]
    );

    if (rows && rows.length > 0) {
      // Pada mode production, jangan timpa password yang mungkin sudah diubah oleh admin
      if (process.env.NODE_ENV === 'production') {
        console.log(`ℹ️ [Production] Akun '${account.email}' sudah terdaftar, melewati pembaruan password.`);
      } else {
        await connection.query(
          'UPDATE users SET name = ?, password = ?, role = ? WHERE email = ?',
          [account.name, hashedPassword, account.role, account.email]
        );
        console.log(`🔄 Akun '${account.email}' (${account.role}) berhasil diperbarui.`);
      }
    } else {
      await connection.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [account.name, account.email, hashedPassword, account.role]
      );
      console.log(`✅ Akun '${account.email}' (${account.role}) berhasil dibuat.`);
    }
  }

  await connection.end();
  console.log('🎉 Seeding selesai dengan aman!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding gagal:', err.message);
  process.exit(1);
});
