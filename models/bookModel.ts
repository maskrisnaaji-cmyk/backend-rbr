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

export const updateBookStatus = async (
  status: string,
  identifier: string | number,
  title?: string
) => {
  const [result] = await pool.execute(
    `UPDATE books SET status = ? WHERE id = ? OR code = ? OR title = ?`,
    [status, identifier, identifier, title || identifier]
  );
  return result as any;
};

export const updateBookCover = async (url: string, entityId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE books SET cover_image = ? WHERE id = ? OR code = ?',
    [url, entityId, entityId]
  );
  return result as any;
};
