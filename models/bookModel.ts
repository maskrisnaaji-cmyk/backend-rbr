import pool from '../config/db';

export interface Book {
  id?: number;
  code?: string | null;
  title: string;
  author: string;
  category: string;
  rack_location: string;
  status: string;
  borrower?: string | null;
  cover_image?: string | null;
  synopsis?: string | null;
  year?: string | null;
  digital_url?: string | null;
}

export const getBooksQuery = async (query: string, params: any[]) => {
  const [rows] = await pool.query(query, params);
  return rows as Book[];
};

export const getBookByIdOrCode = async (id: any) => {
  const [rows] = await pool.execute(
    'SELECT * FROM books WHERE id = ? OR code = ?',
    [id, id]
  );
  return rows as Book[];
};

export const createBook = async (
  code: string,
  title: string,
  author: string,
  category: string,
  rackLocation: string,
  status: string,
  borrower: string,
  coverImage: string,
  synopsis: string,
  year: string,
  digitalUrl: string | null
) => {
  const [result] = await pool.execute(
    'INSERT INTO books (code, title, author, category, rack_location, status, borrower, cover_image, synopsis, year, digital_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      code,
      title,
      author,
      category,
      rackLocation,
      status,
      borrower,
      coverImage,
      synopsis,
      year,
      digitalUrl,
    ]
  );
  return result as any;
};

export const updateBook = async (
  code: string,
  title: string,
  author: string,
  category: string,
  rackLocation: string,
  status: string,
  borrower: string,
  coverValue: string,
  synopsis: string,
  year: string,
  digitalUrlValue: string | null,
  targetId: any
) => {
  const [result] = await pool.execute(
    'UPDATE books SET code = ?, title = ?, author = ?, category = ?, rack_location = ?, status = ?, borrower = ?, cover_image = ?, synopsis = ?, year = ?, digital_url = ? WHERE id = ?',
    [
      code,
      title,
      author,
      category,
      rackLocation,
      status,
      borrower,
      coverValue,
      synopsis,
      year,
      digitalUrlValue,
      targetId,
    ]
  );
  return result as any;
};

export const deleteBook = async (id: any) => {
  const [result] = await pool.execute(
    'DELETE FROM books WHERE id = ? OR code = ?',
    [id, id]
  );
  return result as any;
};

export const getBookByCodeOrTitle = async (code: string, title?: string) => {
  const [rows] = await pool.execute(
    'SELECT * FROM books WHERE code = ? OR title = ? LIMIT 1',
    [code, title || code]
  );
  return rows as Book[];
};

export const updateBookStatus = async (
  status: string,
  identifier: string | number,
  title?: string,
  borrower?: string | null
) => {
  if (borrower !== undefined) {
    const [result] = await pool.execute(
      `UPDATE books SET status = ?, borrower = ? WHERE id = ? OR code = ? OR title = ?`,
      [status, borrower, identifier, identifier, title || identifier]
    );
    return result as any;
  }
  const [result] = await pool.execute(
    `UPDATE books SET status = ? WHERE id = ? OR code = ? OR title = ?`,
    [status, identifier, identifier, title || identifier]
  );
  return result as any;
};

export const syncBookAvailabilityModel = async () => {
  try {
    // 1. Sinkronisasi buku tanpa transaksi peminjaman aktif ke TERSEDIA dan peminjam '-'
    await pool.query(`
      UPDATE books 
      SET status = 'TERSEDIA', borrower = '-' 
      WHERE (
        code IS NULL OR code = '' OR code NOT IN (
          SELECT book_code FROM book_loans 
          WHERE status IN ('active', 'overdue', 'requested') AND book_code IS NOT NULL
        )
      ) AND (
        title NOT IN (
          SELECT title FROM book_loans 
          WHERE status IN ('active', 'overdue', 'requested') AND title IS NOT NULL
        )
      )
    `);

    // 2. Pastikan buku dengan transaksi aktif diset ke DIPINJAM
    await pool.query(`
      UPDATE books b
      JOIN (
        SELECT book_code, title, member_name 
        FROM book_loans 
        WHERE status IN ('active', 'overdue', 'requested')
        ORDER BY id DESC
      ) l ON (b.code = l.book_code OR b.title = l.title)
      SET b.status = 'DIPINJAM', 
          b.borrower = COALESCE(NULLIF(l.member_name, ''), b.borrower, 'Anggota Pustaka')
    `);
  } catch (err: any) {
    console.warn('[syncBookAvailabilityModel] Warning:', err.message);
  }
};

export const updateBookCover = async (url: string, entityId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE books SET cover_image = ? WHERE id = ? OR code = ?',
    [url, entityId, entityId]
  );
  return result as any;
};
