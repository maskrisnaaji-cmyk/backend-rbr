const pool = require('../config/db');

// GET /api/books — Ambil semua koleksi buku
const getAllBooks = async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM books';
    const params = [];
    const conditions = [];

    if (category && category !== 'Semua') {
      conditions.push('category LIKE ?');
      params.push(`%${category}%`);
    }

    if (search) {
      conditions.push('(title LIKE ? OR author LIKE ? OR category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id ASC';

    const [rows] = await pool.query(query, params);
    const normalized = rows.map((b) => ({
      ...b,
      cover_image: b.cover_image || b.image || '',
      image: b.cover_image || b.image || '',
      imageUrl: b.cover_image || b.image || '',
      digital_url: b.digital_url !== undefined && b.digital_url !== null ? b.digital_url : (b.digitalUrl || ''),
      digitalUrl: b.digital_url !== undefined && b.digital_url !== null ? b.digital_url : (b.digitalUrl || ''),
    }));
    res.json(normalized);
  } catch (err) {
    console.error('[getAllBooks]', err);
    res.status(500).json({ message: 'Gagal mengambil data buku.' });
  }
};

// GET /api/books/:id — Ambil satu buku
const getBookById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM books WHERE id = ? OR code = ?', [id, id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    const b = rows[0];
    const normalized = {
      ...b,
      cover_image: b.cover_image || b.image || '',
      image: b.cover_image || b.image || '',
      imageUrl: b.cover_image || b.image || '',
      digital_url: b.digital_url !== undefined && b.digital_url !== null ? b.digital_url : (b.digitalUrl || ''),
      digitalUrl: b.digital_url !== undefined && b.digital_url !== null ? b.digital_url : (b.digitalUrl || ''),
    };
    res.json(normalized);
  } catch (err) {
    console.error('[getBookById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail buku.' });
  }
};

// POST /api/books — Tambah buku baru
const createBook = async (req, res) => {
  try {
    const { code, title, author, category, rack_location, shelfLocation, status, borrower, cover_image, coverImage, image, imageUrl, synopsis, year, digital_url, digitalUrl } = req.body;

    const bookTitle = title;
    const bookCode = code || `NSS-${Date.now().toString().slice(-4)}`;
    const bookAuthor = author || 'Penulis Anonim';
    const bookCategory = category || 'Sastra';
    const bookRack = rack_location || shelfLocation || 'RAK 1A';
    const bookStatus = status || 'Tersedia';
    const bookBorrower = borrower || '-';
    const bookCover = cover_image || coverImage || image || imageUrl || '';
    const bookSynopsis = synopsis || '';
    const bookYear = year || '2024';
    const bookDigitalUrl = digital_url !== undefined ? digital_url : (digitalUrl !== undefined ? digitalUrl : null);

    if (!bookTitle) {
      return res.status(400).json({ message: 'Judul buku wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO books (code, title, author, category, rack_location, status, borrower, cover_image, synopsis, year, digital_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        bookCode,
        bookTitle,
        bookAuthor,
        bookCategory,
        bookRack,
        bookStatus,
        bookBorrower,
        bookCover,
        bookSynopsis,
        bookYear,
        bookDigitalUrl,
      ]
    );

    const [created] = await pool.execute('SELECT * FROM books WHERE id = ?', [result.insertId]);
    const normalized = {
      ...created[0],
      cover_image: created[0].cover_image || created[0].image || '',
      image: created[0].cover_image || created[0].image || '',
      imageUrl: created[0].cover_image || created[0].image || '',
      digital_url: created[0].digital_url !== undefined && created[0].digital_url !== null ? created[0].digital_url : (created[0].digitalUrl || ''),
      digitalUrl: created[0].digital_url !== undefined && created[0].digital_url !== null ? created[0].digital_url : (created[0].digitalUrl || ''),
    };
    res.status(201).json({ message: 'Buku berhasil ditambahkan.', data: normalized });
  } catch (err) {
    console.error('[createBook]', err);
    res.status(500).json({ message: 'Gagal menambahkan buku.' });
  }
};

// PUT /api/books/:id — Perbarui buku
const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, title, author, category, rack_location, shelfLocation, status, borrower, cover_image, coverImage, image, imageUrl, synopsis, year, digital_url, digitalUrl } = req.body;

    const [existing] = await pool.execute('SELECT * FROM books WHERE id = ? OR code = ?', [id, id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }

    const current = existing[0];
    const targetId = current.id;
    const coverValue = cover_image !== undefined ? cover_image : (coverImage !== undefined ? coverImage : (image !== undefined ? image : (imageUrl !== undefined ? imageUrl : current.cover_image)));
    const digitalUrlValue = digital_url !== undefined ? digital_url : (digitalUrl !== undefined ? digitalUrl : current.digital_url);

    await pool.execute(
      'UPDATE books SET code = ?, title = ?, author = ?, category = ?, rack_location = ?, status = ?, borrower = ?, cover_image = ?, synopsis = ?, year = ?, digital_url = ? WHERE id = ?',
      [
        code !== undefined ? code : current.code,
        title !== undefined ? title : current.title,
        author !== undefined ? author : current.author,
        category !== undefined ? category : current.category,
        (rack_location || shelfLocation) !== undefined ? (rack_location || shelfLocation) : current.rack_location,
        status !== undefined ? status : current.status,
        borrower !== undefined ? borrower : current.borrower,
        coverValue,
        synopsis !== undefined ? synopsis : current.synopsis,
        year !== undefined ? year : current.year,
        digitalUrlValue,
        targetId,
      ]
    );

    const [updated] = await pool.execute('SELECT * FROM books WHERE id = ?', [targetId]);
    const normalized = {
      ...updated[0],
      cover_image: updated[0].cover_image || updated[0].image || '',
      image: updated[0].cover_image || updated[0].image || '',
      imageUrl: updated[0].cover_image || updated[0].image || '',
      digital_url: updated[0].digital_url !== undefined && updated[0].digital_url !== null ? updated[0].digital_url : (updated[0].digitalUrl || ''),
      digitalUrl: updated[0].digital_url !== undefined && updated[0].digital_url !== null ? updated[0].digital_url : (updated[0].digitalUrl || ''),
    };
    res.json({ message: 'Buku berhasil diperbarui.', data: normalized });
  } catch (err) {
    console.error('[updateBook]', err);
    res.status(500).json({ message: 'Gagal memperbarui buku.' });
  }
};

// DELETE /api/books/:id — Hapus buku
const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute('DELETE FROM books WHERE id = ? OR code = ?', [id, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    res.json({ message: 'Buku berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteBook]', err);
    res.status(500).json({ message: 'Gagal menghapus buku.' });
  }
};

module.exports = {
  getAllBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
};
