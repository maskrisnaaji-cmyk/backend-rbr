const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function seed() {
  // Koneksi tanpa memilih database dulu agar bisa CREATE DATABASE jika belum ada
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  console.log('🔌 Terhubung ke MySQL...');

  // 1. Buat database jika belum ada (DDL → query(), bukan execute())
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`✅ Database '${process.env.DB_NAME}' siap.`);

  // 2. Gunakan database (DDL → query())
  await connection.query(`USE \`${process.env.DB_NAME}\``);

  // 3. Buat tabel users (DDL → query())
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(100)  NOT NULL,
      email       VARCHAR(100)  NOT NULL UNIQUE,
      phone       VARCHAR(20)   NULL,
      password    VARCHAR(255)  NOT NULL,
      role        ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      security_pin VARCHAR(50)  DEFAULT 'RBR2026',
      createdAt   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('✅ Tabel users siap.');

  // 4. Seed akun dummy
  const accounts = [
    { name: 'Admin RBR', email: 'admin@rbr.com', password: 'rumahbudayamalang', role: 'admin' },
    { name: 'User RBR',  email: 'user@rbr.com',  password: 'user123',           role: 'user'  },
  ];

  for (const account of accounts) {
    const hashedPassword = await bcrypt.hash(account.password, 10);

    // Cek apakah email sudah ada
    const [rows] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [account.email]
    );

    if (rows.length > 0) {
      // Update password dan data terbaru jika akun sudah ada
      await connection.query(
        'UPDATE users SET name = ?, password = ?, role = ? WHERE email = ?',
        [account.name, hashedPassword, account.role, account.email]
      );
      console.log(`🔄 Akun '${account.email}' (${account.role}) berhasil diperbarui dengan password baru.`);
    } else {
      await connection.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [account.name, account.email, hashedPassword, account.role]
      );
      console.log(`✅ Akun '${account.email}' (${account.role}) berhasil ditambahkan.`);
    }
  }

  await connection.end();
  console.log('\n🎉 Seeder selesai! Database siap digunakan.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeder gagal:', err.message);
  process.exit(1);
});
