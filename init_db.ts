import pool from './config/db';

async function initDb() {
  console.log('🔄 Menyiapkan tabel & kolom...');

  // 1. Pastikan tabel menus lengkap
  await pool.query(`
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

  try {
    await pool.query("ALTER TABLE menus ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE");
    await pool.query("UPDATE menus SET is_available = CASE WHEN status = 'Habis' THEN FALSE ELSE TRUE END WHERE is_available IS NULL");
  } catch (err) {
    console.log('Kolom menus is_available sudah ada atau tidak perlu diubah:', err.message);
  }

  // 1b. Kupon promo yang dikelola admin dan dipakai mobile app
  await pool.query(`
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

  try {
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS `desc` VARCHAR(255) NULL");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description VARCHAR(255) NULL");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) NOT NULL DEFAULT 'percent'");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS discount_value INT NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS target_member VARCHAR(20) NOT NULL DEFAULT 'all'");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Aktif'");
    await pool.query("ALTER TABLE coupons ADD COLUMN IF NOT EXISTS theme VARCHAR(20) NOT NULL DEFAULT 'maroon'");
    await pool.query("UPDATE coupons SET `desc` = description WHERE (`desc` IS NULL OR `desc` = '') AND description IS NOT NULL");
    await pool.query("UPDATE coupons SET description = `desc` WHERE (description IS NULL OR description = '') AND `desc` IS NOT NULL");
    await pool.query("UPDATE coupons SET discount_type = 'percent', discount_value = 20 WHERE code = 'BUDAYAKU20' AND (discount_value = 0 OR discount_value IS NULL)");
    await pool.query("UPDATE coupons SET discount_type = 'fixed', discount_value = 10000 WHERE code = 'KOPIKULTUR' AND (discount_value = 0 OR discount_value IS NULL)");
  } catch (cErr: any) {
    console.log('Catatan ALTER coupons:', cErr.message);
  }

  const [couponCount]: any = await pool.query('SELECT COUNT(*) AS count FROM coupons');
  if (couponCount[0].count === 0) {
    await pool.query(
      `INSERT INTO coupons (code, \`desc\`, description, discount_type, discount_value, target_member, is_active, status, theme) VALUES
       ('BUDAYAKU20', 'Diskon 20% untuk Tiket Event Budaya', 'Diskon 20% untuk Tiket Event Budaya', 'percent', 20, 'all', 1, 'Aktif', 'maroon'),
       ('KOPIKULTUR', 'Potongan Rp 10.000 untuk transaksi Kedai', 'Potongan Rp 10.000 untuk transaksi Kedai', 'fixed', 10000, 'all', 1, 'Aktif', 'amber')`
    );
  }

  // 2. Pastikan tabel events lengkap
  await pool.query(`
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
      category VARCHAR(50) NULL DEFAULT 'Budaya'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE events ADD COLUMN booked_count INT DEFAULT 0 AFTER sold");
    console.log('Kolom events booked_count berhasil ditambahkan.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column')) {
      console.log('Kolom events booked_count sudah ada.');
    } else {
      console.log('Catatan ALTER booked_count:', err.message);
    }
  }

  try {
    await pool.query("UPDATE events SET booked_count = COALESCE(sold, 0) WHERE booked_count = 0 OR booked_count IS NULL");
    await pool.query("UPDATE events SET status = 'Tiket Tersedia' WHERE status IN ('Aktif', 'Tersedia')");
    await pool.query("UPDATE events SET status = 'Tiket Penuh' WHERE status IN ('Penuh', 'Habis') OR (quota > 0 AND booked_count >= quota)");
  } catch (err) {
    console.log('Catatan sinkronisasi data events:', err.message);
  }

  try {
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS image VARCHAR(255) NULL");
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_image VARCHAR(255) NULL");
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(50) NULL DEFAULT 'Budaya'");
  } catch (err) {
    console.log('Kolom events sudah ada atau tidak perlu diubah:', err.message);
  }

  // 3. Tabel transaksi tiket untuk menyimpan bukti pembayaran dari upload cloud.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event_id INT NULL,
      customer_name VARCHAR(150) NULL,
      customer_email VARCHAR(150) NULL,
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

  try {
    await pool.query("ALTER TABLE ticket_transactions ADD COLUMN IF NOT EXISTS order_id VARCHAR(100) NULL");
    await pool.query("ALTER TABLE ticket_transactions ADD COLUMN IF NOT EXISTS snap_token VARCHAR(255) NULL");
    await pool.query("ALTER TABLE ticket_transactions ADD COLUMN IF NOT EXISTS redirect_url VARCHAR(500) NULL");
    await pool.query("ALTER TABLE ticket_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NULL");
  } catch (ttErr) {
    console.log('Kolom ticket_transactions sudah ada:', ttErr.message);
  }

  // 3b. Tabel transactions untuk riwayat pembayaran Midtrans (Kedai Kopi & Tiket)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(100) NULL,
      order_type VARCHAR(50) DEFAULT 'kedai',
      customer_name VARCHAR(150) NULL,
      customer_email VARCHAR(150) NULL,
      customer_phone VARCHAR(50) NULL,
      gross_amount INT NOT NULL DEFAULT 0,
      payment_method VARCHAR(50) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      snap_token VARCHAR(255) NULL,
      redirect_url VARCHAR(500) NULL,
      payment_response TEXT NULL,
      items_json TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_id VARCHAR(100) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'kedai'");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_name VARCHAR(150) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_email VARCHAR(150) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gross_amount INT NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending'");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_status VARCHAR(50) NOT NULL DEFAULT 'pending'");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS va_number VARCHAR(100) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank VARCHAR(50) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qr_string TEXT NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qr_url TEXT NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS snap_token VARCHAR(255) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS redirect_url VARCHAR(500) NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_response TEXT NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS items_json TEXT NULL");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    await pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
  } catch (tErr) {
    console.log('Kolom transactions sudah ada:', tErr.message);
  }

  // 4. Pastikan tabel books lengkap
  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      author VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      rack_location VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Tersedia'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL DEFAULT 'Koleksi Sastra'");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS rack_location VARCHAR(50) NULL DEFAULT 'RAK 1A'");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS status VARCHAR(50) NULL DEFAULT 'Tersedia'");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS code VARCHAR(50) NULL");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS borrower VARCHAR(100) NULL DEFAULT '-'");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_image VARCHAR(255) NULL");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS synopsis TEXT NULL");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS year VARCHAR(10) NULL DEFAULT '2024'");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS digital_url TEXT NULL");
  } catch (err) {
    console.log('Kolom books sudah ada atau tidak perlu diubah:', err.message);
  }

  // 4b. Peminjaman buku dan request perpanjangan anggota
  await pool.query(`
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
      due_date DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
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

  // Pastikan tabel users memiliki is_verified dan security_pin
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified TINYINT(1) NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_pin VARCHAR(50) DEFAULT 'RBR2026'");
    await pool.query("UPDATE users SET is_verified = 0 WHERE is_verified IS NULL");
    await pool.query("UPDATE users SET security_pin = 'RBR2026' WHERE security_pin IS NULL");
    console.log('✅ Kolom users is_verified & security_pin siap.');
  } catch (err: any) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.message?.includes('Duplicate column')) {
      console.log('Kolom users is_verified/security_pin sudah ada.');
    } else {
      console.log('Catatan ALTER users:', err.message);
    }
  }

  // Pastikan tabel orders ada untuk tracking pesanan kedai
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(50) PRIMARY KEY,
      order_code VARCHAR(50) NOT NULL,
      table_number VARCHAR(50) NOT NULL,
      items LONGTEXT NOT NULL,
      total_price INT NOT NULL DEFAULT 0,
      total VARCHAR(50) NULL,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
      order_status VARCHAR(50) NOT NULL DEFAULT 'Menunggu',
      status VARCHAR(50) NOT NULL DEFAULT 'menunggu',
      time VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code VARCHAR(50) NULL");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_price INT NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID'");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) NOT NULL DEFAULT 'Menunggu'");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    await pool.query("UPDATE orders SET order_code = id WHERE order_code IS NULL OR order_code = ''");
  } catch (ordErr) {
    console.log('Kolom orders sudah ada atau tidak perlu diubah:', ordErr.message);
  }

  // Buat view alias SQL jika ada query yang menggunakan nama tabel alternatif
  try {
    await pool.query('CREATE OR REPLACE VIEW menu_kedai AS SELECT * FROM menus');
    await pool.query('CREATE OR REPLACE VIEW agenda AS SELECT * FROM events');
  } catch (err) {
    console.log('Catatan view alias:', err.message);
  }

  // Bersihkan data dummy order awal di database/seeder agar antrean awal benar-benar kosong
  try {
    await pool.query("DELETE FROM orders WHERE id IN ('RBR-1040', 'RBR-1041', 'RBR-1042', 'RBR-1043') OR order_code IN ('RBR-1040', 'RBR-1041', 'RBR-1042', 'RBR-1043')");
    console.log('🧹 Data dummy order awal berhasil dibersihkan dari antrean.');
  } catch (cleanErr) {
    console.warn('Catatan pembersihan orders:', cleanErr.message);
  }

  const [menuCount] = await pool.query('SELECT COUNT(*) as count FROM menus');
  if (menuCount[0].count === 0) {
    console.log('🌱 Seeding initial menus...');
    await pool.query(`
      INSERT INTO menus (name, category, price, description, image, status, is_available) VALUES
      ('Es Kopi Susu Creamy', 'Kopi Nusantara', 28000, 'Espresso robusta & arabika blend dengan sirup gula aren murni organik dan susu segar creamy khas racikan barista.', 'assets/images/kopi_susu.jpg', 'Tersedia', TRUE),
      ('Kopi Tubruk', 'Manual Brew', 32000, 'Seduhan manual pour-over V60 berkarakter sweet milk chocolate, floral aroma, dan balance acidity yang halus.', 'assets/images/kopi_tubruk.jpg', 'Tersedia', TRUE),
      ('Americano', 'Manual Brew', 25000, 'Perpaduan kopi espresso murni dengan air mineral panas atau dingin dengan crema halus.', 'assets/images/americano.jpg', 'Tersedia', TRUE),
      ('Wedang Uwuh Rempah', 'Non-Kopi', 22000, 'Racikan rempah daun kayu secang, cengkeh, kayu manis, jahe bakar keprok, dan pemanis alami gula batu.', 'assets/images/wedang_uwuh.jpg', 'Tersedia', TRUE),
      ('Pisang Goreng Keju', 'Camilan Nusantara', 24000, 'Pisang kepok madu goreng tepung renyah dengan taburan keju cheddar parut melimpah dan drizzle saus gula aren.', 'assets/images/pisang_goreng_keju.jpg', 'Habis', FALSE);
    `);
  }

  const [eventCount] = await pool.query('SELECT COUNT(*) as count FROM events');
  if (eventCount[0].count === 0) {
    console.log('🌱 Seeding initial events...');
    await pool.query(`
      INSERT INTO events (title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category) VALUES
      ('Napak Tanah Jilid II Book Club', '2026-09-28', '15:30 WIB', 'Ruang Komunal Lt. 2', 25000, 50, 42, 42, 'Tiket Tersedia', '/napak_tanah.jpeg', '/napak_tanah.jpeg', 'Lokakarya'),
      ('Penampilan Seni Teater Pak Rungkad', '2026-09-29', '19:00 WIB', 'Panggung Utama Pendopo', 35000, 30, 30, 30, 'Tiket Penuh', '/pak_rungkad.jpeg', '/pak_rungkad.jpeg', 'Wicara Seni'),
      ('Obrolan Budaya: Kearifan Lokal Jawa', '2026-10-08', '13:00 WIB', 'Ruang Komunal Lt. 1', 15000, 40, 32, 32, 'Tiket Tersedia', '/oktober_08_obrolan_budaya.jpg', '/oktober_08_obrolan_budaya.jpg', 'Diskusi'),
      ('Pameran Batik Kontemporer Nusantara', '2026-10-09', '10:00 WIB', 'Galeri Utama', 20000, 50, 30, 30, 'Tiket Tersedia', '/oktober_09_pameran_batik.jpg', '/oktober_09_pameran_batik.jpg', 'Pameran'),
      ('Workshop Keramik: Membentuk Tanah Liat', '2026-10-11', '09:00 WIB', 'Studio Kreatif', 45000, 20, 14, 14, 'Tiket Tersedia', '/oktober_11_workshop_keramik.jpg', '/oktober_11_workshop_keramik.jpg', 'Workshop'),
      ('Malam Akustik & Puisi Nusantara', '2026-10-12', '19:00 WIB', 'Pendopo Utama', 30000, 50, 18, 18, 'Tiket Tersedia', '/oktober_12_malam_akustik.jpg', '/oktober_12_malam_akustik.jpg', 'Pertunjukan'),
      ('Sabtu Budaya: Gotong Royong Seni', '2026-10-13', '10:00 WIB', 'Taman Budaya', 0, 50, 25, 25, 'Tiket Tersedia', '/oktober_13_sabtu_budaya.jpg', '/oktober_13_sabtu_budaya.jpg', 'Komunitas');
    `);
  }

  // Sinkronisasi otomatis gambar event dan menu
  try {
    await pool.query("UPDATE events SET image = '/napak_tanah.jpeg', banner_image = '/napak_tanah.jpeg' WHERE title LIKE '%Napak Tanah%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE events SET image = '/pak_rungkad.jpeg', banner_image = '/pak_rungkad.jpeg' WHERE title LIKE '%Rungkad%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE events SET image = '/oktober_08_obrolan_budaya.jpg', banner_image = '/oktober_08_obrolan_budaya.jpg' WHERE title LIKE '%Obrolan%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE events SET image = '/oktober_09_pameran_batik.jpg', banner_image = '/oktober_09_pameran_batik.jpg' WHERE title LIKE '%Batik%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE events SET image = '/oktober_11_workshop_keramik.jpg', banner_image = '/oktober_11_workshop_keramik.jpg' WHERE title LIKE '%Keramik%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE events SET image = '/oktober_12_malam_akustik.jpg', banner_image = '/oktober_12_malam_akustik.jpg' WHERE title LIKE '%Akustik%' AND (banner_image IS NULL OR banner_image = '' OR image = '' OR image = '/rbr_frontt.jpg')");
    await pool.query("UPDATE events SET image = '/oktober_13_sabtu_budaya.jpg', banner_image = '/oktober_13_sabtu_budaya.jpg' WHERE title LIKE '%Sabtu Budaya%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE events SET banner_image = image WHERE (banner_image IS NULL OR banner_image = '') AND image IS NOT NULL AND image != ''");

    await pool.query("UPDATE menus SET image = 'assets/images/wedang_uwuh.jpg' WHERE name LIKE '%Wedang%' AND (image IS NULL OR image = '')");
    await pool.query("UPDATE menus SET image = 'assets/images/pisang_goreng_keju.jpg' WHERE name LIKE '%Pisang%' AND (image IS NULL OR image = '')");
  } catch (syncErr) {
    console.log('Catatan sinkronisasi gambar:', syncErr.message);
  }

  const [bookCount] = await pool.query('SELECT COUNT(*) as count FROM books');
  if (bookCount[0].count === 0) {
    console.log('🌱 Seeding initial books...');
    await pool.query(`
      INSERT INTO books (code, title, author, category, rack_location, status, borrower, cover_image, synopsis, year) VALUES
      ('NSS-001', 'Dokumen Jibril', 'W.S. Rendra', 'KOLEKSI KHUSUS SASTRA KLASIK', 'RAK 3A', 'Tersedia', '-', 'assets/images/dokumen_jibril.jpg', 'Naskah Dokumen Jibril merupakan salah satu karya monumental W.S. Rendra yang merekam dialektika batin kemanusiaan, kritik sosial yang tajam, serta pergolakan spiritual.', '1978'),
      ('NSS-008', 'Anjing-Anjing Menyerbu Lek Zul', 'C.R. Tanujaya', 'PROSA KONTEMPORER', 'RAK 3B', 'Dipinjam', 'Dimas Anggara', 'assets/images/anjing_anjing_menyerbu_lek_zul.jpg', 'Sebuah narasi satir mengenai dinamika sosial masyarakat desa yang menghadapi benturan modernitas dan intrik kuasa.', '1984'),
      ('NSS-015', 'Laki-Laki Yang Kawin Dengan Peri', 'Eka Kurniawan', 'SASTRA REALISME MAGIS', 'RAK 2C', 'Tersedia', '-', 'assets/images/laki_laki_yang_kawin_dengan_peri.jpg', 'Kumpulan cerita pendek yang meramu realisme magis, mitos lokal nusantara, humor gelap, dan kepedihan hidup sehari-hari.', '2015'),
      ('NSS-012', 'Lipstik Di Tas Doni', 'Sujiwo Tejo', 'KOLOM & ESAI BUDAYA', 'RAK 1A', 'Dipinjam', 'Siti Rahma', 'assets/images/lipstik_di_tas_doni.jpg', 'Kumpulan esai reflektif dan celoteh khas sang Dalang Wayang dan Budayawan yang membongkar kemunafikan sosial.', '2007');
    `);
  }

  // 5. Tabel ai_insights — menyimpan riwayat query & respons AI chatbot
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_insights (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT NULL,
      module_type   VARCHAR(100) NOT NULL DEFAULT 'chatbot_budaya',
      input_query   TEXT NOT NULL,
      ai_response_json TEXT NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ai_user_id (user_id),
      INDEX idx_ai_module (module_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS input_query TEXT NULL");
    await pool.query("ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS ai_response_json LONGTEXT NULL");
    await pool.query("ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  } catch (err) {
    console.log('Kolom ai_insights sudah ada atau tidak perlu diubah:', err.message);
  }

  // 6. Tabel audit_logs — mencatat aktivitas sistem untuk keamanan & audit trail
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      action_performed VARCHAR(100) NOT NULL,
      endpoint_target  VARCHAR(255) NULL,
      performed_by     VARCHAR(150) NULL,
      ip_address       VARCHAR(60) NULL,
      meta_info        TEXT NULL,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_action (action_performed),
      INDEX idx_audit_performed_by (performed_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS performed_by VARCHAR(150) NULL");
    await pool.query("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(60) NULL");
    await pool.query("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS meta_info TEXT NULL");
    await pool.query("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  } catch (err) {
    console.log('Kolom audit_logs sudah ada atau tidak perlu diubah:', err.message);
  }

  // 7. Tabel notifications — riwayat & status real-time pesanan / transaksi / aktivitas
  await pool.query(`
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

  // Bersihkan notifikasi order dummy
  try {
    await pool.query("DELETE FROM notifications WHERE order_id IN ('RBR-1040', 'RBR-1041', 'RBR-1042', 'RBR-1043')");
  } catch (_) {}

  const [notifCount] = await pool.query('SELECT COUNT(*) as count FROM notifications');
  if (notifCount[0].count === 0) {
    console.log('🌱 Seeding initial notifications...');
    await pool.query(`
      INSERT INTO notifications (order_id, title, message, type, order_status, is_read, created_at) VALUES
      ('TKT-3041', 'E-Tiket Terkonfirmasi', 'Pendaftaran acara "Napak Tanah Jilid II" berhasil. Siapkan e-tiket saat hadir di lokasi.', 'event', 'Terkonfirmasi', 1, NOW() - INTERVAL 1 DAY);
    `);
  }

  console.log('✅ Inisialisasi DB selesai!');
  process.exit(0);
}

initDb().catch(e => {
  console.error('❌ Gagal inisialisasi DB:', e);
  process.exit(1);
});
