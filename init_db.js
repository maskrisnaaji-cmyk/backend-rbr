const pool = require('./config/db');

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
      status VARCHAR(50) NOT NULL DEFAULT 'Tersedia'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Pastikan tabel events lengkap
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tittle VARCHAR(150) NOT NULL,
      date VARCHAR(100) NOT NULL,
      time VARCHAR(50) NOT NULL,
      location VARCHAR(50) NOT NULL,
      price INT(10) NOT NULL DEFAULT 0,
      quota INT(11) NOT NULL DEFAULT 50,
      sold INT(11) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'Aktif'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS image VARCHAR(255) NULL");
    await pool.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(50) NULL DEFAULT 'Budaya'");
  } catch (err) {
    console.log('Kolom events sudah ada atau tidak perlu diubah:', err.message);
  }

  // 3. Pastikan tabel books lengkap
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
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS code VARCHAR(50) NULL");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS borrower VARCHAR(100) NULL DEFAULT '-'");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_image VARCHAR(255) NULL");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS synopsis TEXT NULL");
    await pool.query("ALTER TABLE books ADD COLUMN IF NOT EXISTS year VARCHAR(10) NULL DEFAULT '2024'");
  } catch (err) {
    console.log('Kolom books sudah ada atau tidak perlu diubah:', err.message);
  }

  // 4. Seeding data awal jika masih kosong
  const [menuCount] = await pool.query('SELECT COUNT(*) as count FROM menus');
  if (menuCount[0].count === 0) {
    console.log('🌱 Seeding initial menus...');
    await pool.query(`
      INSERT INTO menus (name, category, price, description, image, status) VALUES
      ('Es Kopi Susu Creamy', 'Kopi Nusantara', 28000, 'Espresso robusta & arabika blend dengan sirup gula aren murni organik dan susu segar creamy khas racikan barista.', 'assets/images/kopi_susu.jpg', 'Tersedia'),
      ('Kopi Tubruk', 'Manual Brew', 32000, 'Seduhan manual pour-over V60 berkarakter sweet milk chocolate, floral aroma, dan balance acidity yang halus.', 'assets/images/kopi_tubruk.jpg', 'Tersedia'),
      ('Americano', 'Manual Brew', 25000, 'Perpaduan kopi espresso murni dengan air mineral panas atau dingin dengan crema halus.', 'assets/images/americano.jpg', 'Tersedia'),
      ('Wedang Uwuh Rempah', 'Non-Kopi', 22000, 'Racikan rempah daun kayu secang, cengkeh, kayu manis, jahe bakar keprok, dan pemanis alami gula batu.', 'assets/images/wedang_uwuh.jpg', 'Tersedia'),
      ('Pisang Goreng Keju', 'Camilan Nusantara', 24000, 'Pisang kepok madu goreng tepung renyah dengan taburan keju cheddar parut melimpah dan drizzle saus gula aren.', 'assets/images/pisang_goreng_keju.jpg', 'Habis');
    `);
  }

  const [eventCount] = await pool.query('SELECT COUNT(*) as count FROM events');
  if (eventCount[0].count === 0) {
    console.log('🌱 Seeding initial events...');
    await pool.query(`
      INSERT INTO events (tittle, date, time, location, price, quota, sold, status, image, category) VALUES
      ('Napak Tanah Jilid II Book Club', '2026-09-28', '15:30 WIB', 'Ruang Komunal Lt. 2', 25000, 50, 42, 'Aktif', '/napak_tanah.jpeg', 'Lokakarya'),
      ('Penampilan Seni Teater Pak Rungkad', '2026-09-29', '19:00 WIB', 'Panggung Utama Pendopo', 35000, 30, 30, 'Penuh', '/pak_rungkad.jpeg', 'Wicara Seni'),
      ('Obrolan Budaya: Kearifan Lokal Jawa', '2026-10-08', '13:00 WIB', 'Ruang Komunal Lt. 1', 15000, 40, 32, 'Aktif', '', 'Diskusi'),
      ('Pameran Batik Kontemporer Nusantara', '2026-10-09', '10:00 WIB', 'Galeri Utama', 20000, 50, 30, 'Aktif', '', 'Pameran'),
      ('Workshop Keramik: Membentuk Tanah Liat', '2026-10-11', '09:00 WIB', 'Studio Kreatif', 45000, 20, 14, 'Aktif', '', 'Workshop'),
      ('Malam Akustik & Puisi Nusantara', '2026-10-12', '19:00 WIB', 'Pendopo Utama', 30000, 50, 18, 'Aktif', '/rbr_frontt.jpg', 'Pertunjukan'),
      ('Sabtu Budaya: Gotong Royong Seni', '2026-10-13', '10:00 WIB', 'Taman Budaya', 0, 50, 25, 'Aktif', '', 'Komunitas');
    `);
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

  console.log('✅ Inisialisasi DB selesai!');
  process.exit(0);
}

initDb().catch(e => {
  console.error('❌ Gagal inisialisasi DB:', e);
  process.exit(1);
});
