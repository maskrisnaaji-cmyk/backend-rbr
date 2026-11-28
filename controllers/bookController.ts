import { Request, Response } from 'express';
import {
  getBooksQuery,
  getBookByIdOrCode,
  createBook as createBookModel,
  updateBook as updateBookModel,
  deleteBook as deleteBookModel,
  syncBookAvailabilityModel,
} from '../models/bookModel';

const normalizeBook = (b: any) => {
  const rawStatus = (b.status || '').trim();
  const isAvailable =
    !rawStatus ||
    rawStatus.toUpperCase() === 'TERSEDIA' ||
    rawStatus.toLowerCase().includes('tersedia');
  const status = isAvailable ? 'TERSEDIA' : 'DIPINJAM';

  return {
    ...b,
    status,
    is_available: isAvailable,
    isAvailable: isAvailable,
    cover_image: b.cover_image || b.image || '',
    image: b.cover_image || b.image || '',
    imageUrl: b.cover_image || b.image || '',
    coverImage: b.cover_image || b.image || '',
    digital_url: b.digital_url !== undefined && b.digital_url !== null ? b.digital_url : (b.digitalUrl || ''),
    digitalUrl: b.digital_url !== undefined && b.digital_url !== null ? b.digital_url : (b.digitalUrl || ''),
  };
};

// GET /api/books — Ambil semua koleksi buku
export const getAllBooks = async (req: Request, res: Response) => {
  try {
    // Sinkronisasi ketersediaan status buku dengan transaksi peminjaman aktif
    await syncBookAvailabilityModel().catch(() => null);

    const { category, search } = req.query as { category?: string; search?: string };
    let query = 'SELECT * FROM books';
    const params: any[] = [];
    const conditions: string[] = [];

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

    const rows = await getBooksQuery(query, params);
    const normalized = rows.map(normalizeBook);
    res.json(normalized);
  } catch (err) {
    console.error('[getAllBooks]', err);
    res.status(500).json({ message: 'Gagal mengambil data buku.' });
  }
};

// GET /api/books/:id — Ambil satu buku
export const getBookById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await getBookByIdOrCode(id);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    const normalized = normalizeBook(rows[0]);
    res.json(normalized);
  } catch (err) {
    console.error('[getBookById]', err);
    res.status(500).json({ message: 'Gagal mengambil detail buku.' });
  }
};

// POST /api/books — Tambah buku baru
export const createBook = async (req: Request, res: Response) => {
  try {
    const { code, title, author, category, rack_location, shelfLocation, status, borrower, cover_image, coverImage, image, imageUrl, synopsis, year, digital_url, digitalUrl } = req.body;

    const bookTitle = title;
    const bookCode = code || `NSS-${Date.now().toString().slice(-4)}`;
    const bookAuthor = author || 'Penulis Anonim';
    const bookCategory = category || 'Sastra';
    const bookRack = rack_location || shelfLocation || 'RAK 1A';

    // Default status buku baru adalah TERSEDIA (bukan DIPINJAM)
    const isExplicitDipinjam = status && (status.toUpperCase() === 'DIPINJAM' || status.toLowerCase().includes('pinjam'));
    const bookStatus = isExplicitDipinjam ? 'DIPINJAM' : 'TERSEDIA';
    const bookBorrower = isExplicitDipinjam ? (borrower || 'Anggota Pustaka') : (borrower && borrower !== '-' ? borrower : '-');

    const bookCover = cover_image || coverImage || image || imageUrl || '';
    const bookSynopsis = synopsis || '';
    const bookYear = year || '2024';
    const bookDigitalUrl = digital_url !== undefined ? digital_url : (digitalUrl !== undefined ? digitalUrl : null);

    if (!bookTitle) {
      return res.status(400).json({ message: 'Judul buku wajib diisi.' });
    }

    const result = await createBookModel(
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
      bookDigitalUrl
    );

    const created = await getBookByIdOrCode(result.insertId);
    const normalized = normalizeBook(created[0]);
    res.status(201).json({ message: 'Buku berhasil ditambahkan.', data: normalized });
  } catch (err) {
    console.error('[createBook]', err);
    res.status(500).json({ message: 'Gagal menambahkan buku.' });
  }
};

// PUT /api/books/:id — Perbarui buku
export const updateBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, title, author, category, rack_location, shelfLocation, status, borrower, cover_image, coverImage, image, imageUrl, synopsis, year, digital_url, digitalUrl } = req.body;

    const existing = await getBookByIdOrCode(id);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }

    const current: any = existing[0];
    const targetId = current.id;
    const coverValue = cover_image !== undefined ? cover_image : (coverImage !== undefined ? coverImage : (image !== undefined ? image : (imageUrl !== undefined ? imageUrl : current.cover_image)));
    const digitalUrlValue = digital_url !== undefined ? digital_url : (digitalUrl !== undefined ? digitalUrl : current.digital_url);

    let nextStatus = current.status;
    let nextBorrower = current.borrower;

    if (status !== undefined) {
      const isAvailable = (status || '').toUpperCase() === 'TERSEDIA' || (status || '').toLowerCase().includes('tersedia');
      nextStatus = isAvailable ? 'TERSEDIA' : 'DIPINJAM';
      if (isAvailable && borrower === undefined) {
        nextBorrower = '-';
      }
    }

    if (borrower !== undefined) {
      nextBorrower = borrower;
    }

    await updateBookModel(
      code !== undefined ? code : current.code,
      title !== undefined ? title : current.title,
      author !== undefined ? author : current.author,
      category !== undefined ? category : current.category,
      (rack_location || shelfLocation) !== undefined ? (rack_location || shelfLocation) : current.rack_location,
      nextStatus,
      nextBorrower,
      coverValue,
      synopsis !== undefined ? synopsis : current.synopsis,
      year !== undefined ? year : current.year,
      digitalUrlValue,
      targetId
    );

    const updated = await getBookByIdOrCode(targetId);
    const normalized = normalizeBook(updated[0]);
    res.json({ message: 'Buku berhasil diperbarui.', data: normalized });
  } catch (err) {
    console.error('[updateBook]', err);
    res.status(500).json({ message: 'Gagal memperbarui buku.' });
  }
};

// DELETE /api/books/:id — Hapus buku
export const deleteBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await deleteBookModel(id);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Buku tidak ditemukan.' });
    }
    res.json({ message: 'Buku berhasil dihapus.' });
  } catch (err) {
    console.error('[deleteBook]', err);
    res.status(500).json({ message: 'Gagal menghapus buku.' });
  }
};
