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
    res.json(rows);
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
    res.json(rows[0]);
  } catch (err) {
    console.error('[getBookById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail buku.' });
  }
};

// POST /api/books — Tambah buku baru
const createBook = async (req, res) => {
  try {
    const { code, title, author, category, rack_location, shelfLocation, status, borrower, cover_image, coverImage, synopsis, year } = req.body;

    const bookTitle = title;
    const bookCode = code || `NSS-${Date.now().toString().slice(-4)}`;
    const bookAuthor = author || 'Penulis Anonim';
    const bookCategory = category || 'Sastra';
    const bookRack = rack_location || shelfLocation || 'RAK 1A';
    const bookStatus = status || 'Tersedia';
    const bookBorrower = borrower || '-';
    const bookCover = cover_image || coverImage || '';
    const bookSynopsis = synopsis || '';
    const bookYear = year || '2024';

    if (!bookTitle) {
      return res.status(400).json({ message: 'Judul buku wajib diisi.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO books (code, title, author, category, rack_location, status, borrower, cover_image, synopsis, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      ]
    );

    const [created] = await pool.execute('SELECT * FROM books WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Buku berhasil ditambahkan.', data: created[0] });
  } catch (err) {
    console.error('[createBook]', err);
    res.status(500).json({ message: 'Gagal menambahkan buku.' });
  }
};

// PUT /api/books/:id — Perbarui buku
const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, title, author, category, rack_location, shelfLocation, status, borrower, cover_image, coverImage, synopsis, year } = req.body;

    const [existing] = await pool.execute('SELECT * FROM books WHERE id = ? OR code = ?', [id, id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }

    const current = existing[0];
    const targetId = current.id;

    await pool.execute(
      'UPDATE books SET code = ?, title = ?, author = ?, category = ?, rack_location = ?, status = ?, borrower = ?, cover_image = ?, synopsis = ?, year = ? WHERE id = ?',
      [
        code !== undefined ? code : current.code,
        title !== undefined ? title : current.title,
        author !== undefined ? author : current.author,
        category !== undefined ? category : current.category,
        (rack_location || shelfLocation) !== undefined ? (rack_location || shelfLocation) : current.rack_location,
        status !== undefined ? status : current.status,
        borrower !== undefined ? borrower : current.borrower,
        (cover_image || coverImage) !== undefined ? (cover_image || coverImage) : current.cover_image,
        synopsis !== undefined ? synopsis : current.synopsis,
        year !== undefined ? year : current.year,
        targetId,
      ]
    );

    const [updated] = await pool.execute('SELECT * FROM books WHERE id = ?', [targetId]);
    res.json({ message: 'Buku berhasil diperbarui.', data: updated[0] });
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
