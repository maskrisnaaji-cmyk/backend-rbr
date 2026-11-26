import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Helper idempotent untuk menambahkan kolom ke tabel hanya jika kolom belum ada.
 * Menggunakan INFORMATION_SCHEMA.COLUMNS untuk menghindari error ER_DUP_FIELDNAME.
 */
export async function ensureColumn(
  conn: mysql.Connection | mysql.Pool,
  tableName: string,
  columnName: string,
  columnDefinition: string
): Promise<void> {
  try {
    const [rows]: any = await conn.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = ? 
         AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );

    if (!rows || rows.length === 0) {
      await conn.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`
      );
      console.log(`  + [ALTER] Kolom '${columnName}' ditambahkan ke tabel '${tableName}'.`);
    }
  } catch (err: any) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column')) {
      return;
    }
    console.warn(`  ⚠️ Peringatan saat memastikan kolom ${tableName}.${columnName}:`, err.message);
  }
}

async function initDb() {
  console.log('🔄 Memulai inisialisasi skema database Rumah Budaya Ratna...');

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT) || 3306;
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'rumah_budaya_ratna';

  // 1. Hubungkan ke MySQL instance tanpa memilih database terlebih dahulu
  const connection = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
  });

  console.log(`🔌 Terhubung ke server MySQL (${dbHost}:${dbPort}).`);

  // 2. Buat database jika belum ada
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`✅ Database '${dbName}' siap.`);

  // 3. Gunakan database tersebut
  await connection.query(`USE \`${dbName}\``);

  console.log('📋 Mengunci struktur tabel & kolom...');

  // ─── TABEL 1: USERS (Admin & Anggota) ────────────────────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      phone VARCHAR(20) NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      is_verified TINYINT(1) NOT NULL DEFAULT 0,
      security_pin VARCHAR(50) DEFAULT 'RBR2026',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'users', 'is_verified', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'users', 'security_pin', "VARCHAR(50) DEFAULT 'RBR2026'");
  await connection.query("UPDATE users SET is_verified = 0 WHERE is_verified IS NULL");
  await connection.query("UPDATE users SET security_pin = 'RBR2026' WHERE security_pin IS NULL");

  // ─── TABEL 2: MENUS (Katalog Kedai Kopi & Kuliner) ───────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS menus (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      price INT(10) NOT NULL,
      description TEXT NOT NULL,
      image VARCHAR(255) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Tersedia',
      is_available BOOLEAN NOT NULL DEFAULT TRUE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'menus', 'is_available', 'BOOLEAN NOT NULL DEFAULT TRUE');
  await connection.query(
    "UPDATE menus SET is_available = CASE WHEN status = 'Habis' THEN FALSE ELSE TRUE END WHERE is_available IS NULL"
  );

  // ─── TABEL 3: COUPONS (Kupon Promo Diskon) ──────────────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      \`desc\` VARCHAR(255) NULL,
      description VARCHAR(255) NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
      discount_value INT NOT NULL DEFAULT 0,
      target_member VARCHAR(20) NOT NULL DEFAULT 'all',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'Aktif',
      theme VARCHAR(20) NOT NULL DEFAULT 'maroon',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'coupons', 'desc', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'coupons', 'description', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'coupons', 'discount_type', "VARCHAR(20) NOT NULL DEFAULT 'percent'");
  await ensureColumn(connection, 'coupons', 'discount_value', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'coupons', 'target_member', "VARCHAR(20) NOT NULL DEFAULT 'all'");
  await ensureColumn(connection, 'coupons', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn(connection, 'coupons', 'status', "VARCHAR(30) NOT NULL DEFAULT 'Aktif'");
  await ensureColumn(connection, 'coupons', 'theme', "VARCHAR(20) NOT NULL DEFAULT 'maroon'");
  await connection.query(
    "UPDATE coupons SET `desc` = description WHERE (`desc` IS NULL OR `desc` = '') AND description IS NOT NULL"
  );
  await connection.query(
    "UPDATE coupons SET description = `desc` WHERE (description IS NULL OR description = '') AND `desc` IS NOT NULL"
  );

  // ─── TABEL 4: EVENTS (Agenda & Tiket Budaya) ─────────────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      date VARCHAR(100) NOT NULL,
      time VARCHAR(50) NOT NULL,
      location VARCHAR(50) NOT NULL,
      price INT(10) NOT NULL DEFAULT 0,
      quota INT(11) NOT NULL DEFAULT 50,
      sold INT(11) NOT NULL DEFAULT 0,
      booked_count INT(11) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'Tiket Tersedia',
      image VARCHAR(255) NULL,
      banner_image VARCHAR(255) NULL,
      category VARCHAR(50) NULL DEFAULT 'Budaya',
      organizer_name VARCHAR(150) NULL,
      organizer_contact VARCHAR(100) NULL,
      organizer_email VARCHAR(150) NULL,
      description TEXT NULL,
      status_approval VARCHAR(50) NOT NULL DEFAULT 'approved',
      rejection_reason TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'events', 'sold', 'INT(11) NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'events', 'booked_count', 'INT(11) NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'events', 'image', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'events', 'banner_image', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'events', 'category', "VARCHAR(50) NULL DEFAULT 'Budaya'");
  await ensureColumn(connection, 'events', 'organizer_name', 'VARCHAR(150) NULL');
  await ensureColumn(connection, 'events', 'organizer_contact', 'VARCHAR(100) NULL');
  await ensureColumn(connection, 'events', 'organizer_email', 'VARCHAR(150) NULL');
  await ensureColumn(connection, 'events', 'description', 'TEXT NULL');
  await ensureColumn(connection, 'events', 'status_approval', "VARCHAR(50) NOT NULL DEFAULT 'approved'");
  await ensureColumn(connection, 'events', 'rejection_reason', 'TEXT NULL');

  // Sinkronisasi data sold & booked_count agar versi lama dan baru selalu sinkron
  await connection.query(
    "UPDATE events SET booked_count = COALESCE(sold, 0) WHERE booked_count IS NULL OR (booked_count = 0 AND sold > 0)"
  );
  await connection.query(
    "UPDATE events SET sold = COALESCE(booked_count, 0) WHERE sold IS NULL OR (sold = 0 AND booked_count > 0)"
  );
  await connection.query(
    "UPDATE events SET status = 'Tiket Penuh' WHERE quota > 0 AND (booked_count >= quota OR sold >= quota)"
  );

  // ─── TABEL 5: TICKET_TRANSACTIONS (Transaksi Pemesanan Tiket) ────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ticket_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NULL,
      customer_name VARCHAR(150) NULL,
      customer_email VARCHAR(150) NULL,
      quantity INT DEFAULT 1,
      amount INT NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'Menunggu Pembayaran',
      payment_proof VARCHAR(500) NULL,
      order_id VARCHAR(100) NULL,
      snap_token VARCHAR(255) NULL,
      redirect_url VARCHAR(500) NULL,
      payment_method VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'ticket_transactions', 'order_id', 'VARCHAR(100) NULL');
  await ensureColumn(connection, 'ticket_transactions', 'quantity', 'INT DEFAULT 1');
  await ensureColumn(connection, 'ticket_transactions', 'snap_token', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'ticket_transactions', 'redirect_url', 'VARCHAR(500) NULL');
  await ensureColumn(connection, 'ticket_transactions', 'payment_method', 'VARCHAR(50) NULL');

  // ─── TABEL 6: TRANSACTIONS (Transaksi Gateway Midtrans Kedai & Tiket) ─────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(100) NULL,
      order_type VARCHAR(50) DEFAULT 'kedai',
      customer_name VARCHAR(150) NULL,
      customer_email VARCHAR(150) NULL,
      customer_phone VARCHAR(50) NULL,
      gross_amount INT NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      payment_type VARCHAR(50) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      transaction_status VARCHAR(50) NOT NULL DEFAULT 'pending',
      va_number VARCHAR(100) NULL,
      bank VARCHAR(50) NULL,
      qr_string TEXT NULL,
      qr_url TEXT NULL,
      snap_token VARCHAR(255) NULL,
      redirect_url VARCHAR(500) NULL,
      payment_response TEXT NULL,
      items_json TEXT NULL,
      expired_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'transactions', 'order_id', 'VARCHAR(100) NULL');
  await ensureColumn(connection, 'transactions', 'order_type', "VARCHAR(50) DEFAULT 'kedai'");
  await ensureColumn(connection, 'transactions', 'customer_name', 'VARCHAR(150) NULL');
  await ensureColumn(connection, 'transactions', 'customer_email', 'VARCHAR(150) NULL');
  await ensureColumn(connection, 'transactions', 'customer_phone', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'transactions', 'gross_amount', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'transactions', 'payment_method', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'transactions', 'payment_type', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'transactions', 'status', "VARCHAR(50) NOT NULL DEFAULT 'pending'");
  await ensureColumn(connection, 'transactions', 'transaction_status', "VARCHAR(50) NOT NULL DEFAULT 'pending'");
  await ensureColumn(connection, 'transactions', 'va_number', 'VARCHAR(100) NULL');
  await ensureColumn(connection, 'transactions', 'bank', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'transactions', 'qr_string', 'TEXT NULL');
  await ensureColumn(connection, 'transactions', 'qr_url', 'TEXT NULL');
  await ensureColumn(connection, 'transactions', 'snap_token', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'transactions', 'redirect_url', 'VARCHAR(500) NULL');
  await ensureColumn(connection, 'transactions', 'payment_response', 'TEXT NULL');
  await ensureColumn(connection, 'transactions', 'items_json', 'TEXT NULL');
  await ensureColumn(connection, 'transactions', 'expired_at', 'TIMESTAMP NULL');

  // ─── TABEL 7: BOOKS (Pustaka Naskah & Koleksi Buku) ──────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS books (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NULL,
      title VARCHAR(150) NOT NULL,
      author VARCHAR(100) NOT NULL,
      category VARCHAR(100) NULL DEFAULT 'Koleksi Sastra',
      rack_location VARCHAR(50) NULL DEFAULT 'RAK 1A',
      status VARCHAR(50) NOT NULL DEFAULT 'Tersedia',
      borrower VARCHAR(100) NULL DEFAULT '-',
      cover_image VARCHAR(255) NULL,
      synopsis TEXT NULL,
      year VARCHAR(10) NULL DEFAULT '2024',
      digital_url TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'books', 'code', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'books', 'category', "VARCHAR(100) NULL DEFAULT 'Koleksi Sastra'");
  await ensureColumn(connection, 'books', 'rack_location', "VARCHAR(50) NULL DEFAULT 'RAK 1A'");
  await ensureColumn(connection, 'books', 'status', "VARCHAR(50) NULL DEFAULT 'Tersedia'");
  await ensureColumn(connection, 'books', 'borrower', "VARCHAR(100) NULL DEFAULT '-'");
  await ensureColumn(connection, 'books', 'cover_image', 'VARCHAR(255) NULL');
  await ensureColumn(connection, 'books', 'synopsis', 'TEXT NULL');
  await ensureColumn(connection, 'books', 'year', "VARCHAR(10) NULL DEFAULT '2024'");
  await ensureColumn(connection, 'books', 'digital_url', 'TEXT NULL');

  // ─── TABEL 8: BOOK_LOANS (Peminjaman & Riwayat Buku) ─────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS book_loans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      book_code VARCHAR(50) NOT NULL,
      title VARCHAR(150) NOT NULL,
      author VARCHAR(150) NULL,
      rack_location VARCHAR(50) NULL,
      member_id INT NULL,
      member_name VARCHAR(150) NOT NULL,
      member_email VARCHAR(150) NULL,
      borrow_date DATE NOT NULL,
      borrow_at DATETIME NULL,
      due_date DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      request_status VARCHAR(30) NOT NULL DEFAULT 'none',
      request_requested_at DATETIME NULL,
      request_reviewed_at DATETIME NULL,
      extension_status VARCHAR(30) NOT NULL DEFAULT 'none',
      extension_days INT NULL,
      extension_requested_at DATETIME NULL,
      extension_reviewed_at DATETIME NULL,
      returned_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_book_loans_member (member_id),
      INDEX idx_book_loans_status (status),
      INDEX idx_book_loans_extension (extension_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'book_loans', 'borrow_at', 'DATETIME NULL');
  await ensureColumn(connection, 'book_loans', 'request_status', "VARCHAR(30) NOT NULL DEFAULT 'none'");
  await ensureColumn(connection, 'book_loans', 'request_requested_at', 'DATETIME NULL');
  await ensureColumn(connection, 'book_loans', 'request_reviewed_at', 'DATETIME NULL');
  await ensureColumn(connection, 'book_loans', 'extension_status', "VARCHAR(30) NOT NULL DEFAULT 'none'");
  await ensureColumn(connection, 'book_loans', 'extension_days', 'INT NULL');
  await ensureColumn(connection, 'book_loans', 'extension_requested_at', 'DATETIME NULL');
  await ensureColumn(connection, 'book_loans', 'extension_reviewed_at', 'DATETIME NULL');
  await ensureColumn(connection, 'book_loans', 'returned_at', 'DATETIME NULL');

  // ─── TABEL 9: ORDERS (Pesanan Antrean Kedai Kopi) ─────────────────────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(50) PRIMARY KEY,
      order_code VARCHAR(50) NULL,
      table_number VARCHAR(50) NOT NULL,
      items LONGTEXT NOT NULL,
      total_price INT NOT NULL DEFAULT 0,
      items_json TEXT NULL,
      items_summary TEXT NULL,
      total VARCHAR(50) NULL,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
      order_status VARCHAR(50) NOT NULL DEFAULT 'Menunggu',
      status VARCHAR(50) NOT NULL DEFAULT 'menunggu',
      time VARCHAR(50) NULL,
      payment_method VARCHAR(50) NULL,
      expired_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'orders', 'order_code', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'orders', 'total_price', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'orders', 'items_json', 'TEXT NULL');
  await ensureColumn(connection, 'orders', 'items_summary', 'TEXT NULL');
  await ensureColumn(connection, 'orders', 'payment_status', "VARCHAR(20) NOT NULL DEFAULT 'UNPAID'");
  await ensureColumn(connection, 'orders', 'order_status', "VARCHAR(50) NOT NULL DEFAULT 'Menunggu'");
  await ensureColumn(connection, 'orders', 'status', "VARCHAR(50) NOT NULL DEFAULT 'menunggu'");
  await ensureColumn(connection, 'orders', 'time', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'orders', 'payment_method', 'VARCHAR(50) NULL');
  await ensureColumn(connection, 'orders', 'expired_at', 'TIMESTAMP NULL');
  await connection.query("UPDATE orders SET order_code = id WHERE order_code IS NULL OR order_code = ''");

  // ─── TABEL 10: AI_INSIGHTS (Riwayat Tanya-Jawab Chatbot AI Budaya) ────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      module_type VARCHAR(100) NOT NULL DEFAULT 'chatbot_budaya',
      input_query TEXT NULL,
      ai_response_json LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ai_user_id (user_id),
      INDEX idx_ai_module (module_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'ai_insights', 'input_query', 'TEXT NULL');
  await ensureColumn(connection, 'ai_insights', 'ai_response_json', 'LONGTEXT NULL');

  // ─── TABEL 11: AUDIT_LOGS (Audit Trail Aktivitas Sistem & Keamanan) ──────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action_performed VARCHAR(100) NOT NULL,
      endpoint_target VARCHAR(255) NULL,
      performed_by VARCHAR(150) NULL,
      ip_address VARCHAR(60) NULL,
      meta_info TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_action (action_performed),
      INDEX idx_audit_performed_by (performed_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await ensureColumn(connection, 'audit_logs', 'performed_by', 'VARCHAR(150) NULL');
  await ensureColumn(connection, 'audit_logs', 'ip_address', 'VARCHAR(60) NULL');
  await ensureColumn(connection, 'audit_logs', 'meta_info', 'TEXT NULL');

  // ─── TABEL 12: NOTIFICATIONS (Pemberitahuan Transaksi & Aktivitas) ────────────
  await connection.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      order_id VARCHAR(100) NULL,
      title VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'order',
      order_status VARCHAR(50) NOT NULL DEFAULT 'Pesanan Dibuat',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notif_order_id (order_id),
      INDEX idx_notif_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // ─── SQL VIEWS UNTUK COMPATIBILITY ───────────────────────────────────────────
  try {
    await connection.query('CREATE OR REPLACE VIEW menu_kedai AS SELECT * FROM menus');
    await connection.query('CREATE OR REPLACE VIEW agenda AS SELECT * FROM events');
    await connection.query('CREATE OR REPLACE VIEW loans AS SELECT * FROM book_loans');
    console.log('✅ SQL Views (menu_kedai, agenda, loans) siap.');
  } catch (err: any) {
    console.warn('Catatan view alias:', err.message);
  }

  // ─── SEED DATA DASAR (IDEMPOTENT - HANYA JIKA TABEL KOSONG) ─────────────────
  const [couponCount]: any = await connection.query('SELECT COUNT(*) AS count FROM coupons');
  if (couponCount[0].count === 0) {
    console.log('🌱 Seeding initial coupons...');
    await connection.query(`
      INSERT INTO coupons (code, \`desc\`, description, discount_type, discount_value, target_member, is_active, status, theme) VALUES
      ('BUDAYAKU20', 'Diskon 20% untuk Tiket Event Budaya', 'Diskon 20% untuk Tiket Event Budaya', 'percent', 20, 'all', 1, 'Aktif', 'maroon'),
      ('KOPIKULTUR', 'Potongan Rp 10.000 untuk transaksi Kedai', 'Potongan Rp 10.000 untuk transaksi Kedai', 'fixed', 10000, 'all', 1, 'Aktif', 'amber')
    `);
  }

  const [menuCount]: any = await connection.query('SELECT COUNT(*) as count FROM menus');
  if (menuCount[0].count === 0) {
    console.log('🌱 Seeding initial menus...');
    await connection.query(`
      INSERT INTO menus (name, category, price, description, image, status, is_available) VALUES
      ('Es Kopi Susu Creamy', 'Kopi Nusantara', 28000, 'Espresso robusta & arabika blend dengan sirup gula aren murni organik dan susu segar creamy khas racikan barista.', 'assets/images/kopi_susu.jpg', 'Tersedia', TRUE),
      ('Kopi Tubruk', 'Manual Brew', 32000, 'Seduhan manual pour-over V60 berkarakter sweet milk chocolate, floral aroma, dan balance acidity yang halus.', 'assets/images/kopi_tubruk.jpg', 'Tersedia', TRUE),
      ('Americano', 'Manual Brew', 25000, 'Perpaduan kopi espresso murni dengan air mineral panas atau dingin dengan crema halus.', 'assets/images/americano.jpg', 'Tersedia', TRUE),
      ('Wedang Uwuh Rempah', 'Non-Kopi', 22000, 'Racikan rempah daun kayu secang, cengkeh, kayu manis, jahe bakar keprok, dan pemanis alami gula batu.', 'assets/images/wedang_uwuh.jpg', 'Tersedia', TRUE),
      ('Pisang Goreng Keju', 'Camilan Nusantara', 24000, 'Pisang kepok madu goreng tepung renyah dengan taburan keju cheddar parut melimpah dan drizzle saus gula aren.', 'assets/images/pisang_goreng_keju.jpg', 'Habis', FALSE)
    `);
  }

  const [eventCount]: any = await connection.query('SELECT COUNT(*) as count FROM events');
  if (eventCount[0].count === 0) {
    console.log('🌱 Seeding initial events...');
    await connection.query(`
      INSERT INTO events (title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category) VALUES
      ('Napak Tanah Jilid II Book Club', '2026-09-28', '15:30 WIB', 'Ruang Komunal Lt. 2', 25000, 50, 42, 42, 'Tiket Tersedia', '/napak_tanah.jpeg', '/napak_tanah.jpeg', 'Lokakarya'),
      ('Penampilan Seni Teater Pak Rungkad', '2026-09-29', '19:00 WIB', 'Panggung Utama Pendopo', 35000, 30, 30, 30, 'Tiket Penuh', '/pak_rungkad.jpeg', '/pak_rungkad.jpeg', 'Wicara Seni'),
      ('Obrolan Budaya: Kearifan Lokal Jawa', '2026-10-08', '13:00 WIB', 'Ruang Komunal Lt. 1', 15000, 40, 32, 32, 'Tiket Tersedia', '/oktober_08_obrolan_budaya.jpg', '/oktober_08_obrolan_budaya.jpg', 'Diskusi'),
      ('Pameran Batik Kontemporer Nusantara', '2026-10-09', '10:00 WIB', 'Galeri Utama', 20000, 50, 30, 30, 'Tiket Tersedia', '/oktober_09_pameran_batik.jpg', '/oktober_09_pameran_batik.jpg', 'Pameran'),
      ('Workshop Keramik: Membentuk Tanah Liat', '2026-10-11', '09:00 WIB', 'Studio Kreatif', 45000, 20, 14, 14, 'Tiket Tersedia', '/oktober_11_workshop_keramik.jpg', '/oktober_11_workshop_keramik.jpg', 'Workshop'),
      ('Malam Akustik & Puisi Nusantara', '2026-10-12', '19:00 WIB', 'Pendopo Utama', 30000, 50, 18, 18, 'Tiket Tersedia', '/oktober_12_malam_akustik.jpg', '/oktober_12_malam_akustik.jpg', 'Pertunjukan'),
      ('Sabtu Budaya: Gotong Royong Seni', '2026-10-13', '10:00 WIB', 'Taman Budaya', 0, 50, 25, 25, 'Tiket Tersedia', '/oktober_13_sabtu_budaya.jpg', '/oktober_13_sabtu_budaya.jpg', 'Komunitas')
    `);
  }

  const [bookCount]: any = await connection.query('SELECT COUNT(*) as count FROM books');
  if (bookCount[0].count === 0) {
    console.log('🌱 Seeding initial books...');
    await connection.query(`
      INSERT INTO books (code, title, author, category, rack_location, status, borrower, cover_image, synopsis, year) VALUES
      ('NSS-001', 'Dokumen Jibril', 'W.S. Rendra', 'KOLEKSI KHUSUS SASTRA KLASIK', 'RAK 3A', 'Tersedia', '-', 'assets/images/dokumen_jibril.jpg', 'Naskah Dokumen Jibril merupakan salah satu karya monumental W.S. Rendra yang merekam dialektika batin kemanusiaan, kritik sosial yang tajam, serta pergolakan spiritual.', '1978'),
      ('NSS-008', 'Anjing-Anjing Menyerbu Lek Zul', 'C.R. Tanujaya', 'PROSA KONTEMPORER', 'RAK 3B', 'Dipinjam', 'Dimas Anggara', 'assets/images/anjing_anjing_menyerbu_lek_zul.jpg', 'Sebuah narasi satir mengenai dinamika sosial masyarakat desa yang menghadapi benturan modernitas dan intrik kuasa.', '1984'),
      ('NSS-015', 'Laki-Laki Yang Kawin Dengan Peri', 'Eka Kurniawan', 'SASTRA REALISME MAGIS', 'RAK 2C', 'Tersedia', '-', 'assets/images/laki_laki_yang_kawin_dengan_peri.jpg', 'Kumpulan cerita pendek yang meramu realisme magis, mitos lokal nusantara, humor gelap, dan kepedihan hidup sehari-hari.', '2015'),
      ('NSS-012', 'Lipstik Di Tas Doni', 'Sujiwo Tejo', 'KOLOM & ESAI BUDAYA', 'RAK 1A', 'Dipinjam', 'Siti Rahma', 'assets/images/lipstik_di_tas_doni.jpg', 'Kumpulan esai reflektif dan celoteh khas sang Dalang Wayang dan Budayawan yang membongkar kemunafikan sosial.', '2007')
    `);
  }

  // Pembersihan order dummy awal hanya saat development
  if (process.env.NODE_ENV !== 'production') {
    try {
      await connection.query(
        "DELETE FROM orders WHERE id IN ('RBR-1040', 'RBR-1041', 'RBR-1042', 'RBR-1043') OR order_code IN ('RBR-1040', 'RBR-1041', 'RBR-1042', 'RBR-1043')"
      );
      await connection.query(
        "DELETE FROM notifications WHERE order_id IN ('RBR-1040', 'RBR-1041', 'RBR-1042', 'RBR-1043')"
      );
    } catch (_) {}
  }

  await connection.end();
  console.log('✅ Inisialisasi DB selesai dengan sukses!');
}

initDb().catch((err) => {
  console.error('❌ Gagal inisialisasi DB:', err);
  process.exit(1);
});
