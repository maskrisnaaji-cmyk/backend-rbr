import pool from '../config/db';

export interface BookLoan {
  id?: number;
  book_code: string;
  title: string;
  author?: string | null;
  rack_location?: string | null;
  member_id?: number | null;
  member_name?: string | null;
  member_email?: string | null;
  borrow_date: string | Date;
  due_date: string | Date;
  returned_at?: string | Date | null;
  status: 'active' | 'returned' | 'overdue' | string;
  extension_status: 'none' | 'pending' | 'approved' | 'rejected' | string;
  extension_days?: number | null;
  extension_requested_at?: string | Date | null;
  extension_reviewed_at?: string | Date | null;
  created_at?: string | Date;
}

export const syncOverdueStatus = async () => {
  const [result] = await pool.execute(
    "UPDATE book_loans SET status = 'overdue' WHERE status = 'active' AND due_date < CURDATE()"
  );
  return result as any;
};

export const getLoansByMember = async (memberId: number | string, memberEmail: string) => {
  const [rows] = await pool.execute(
    `SELECT * FROM book_loans
     WHERE member_id = ? OR (member_id IS NULL AND member_email = ?)
     ORDER BY due_date ASC`,
    [memberId, memberEmail]
  );
  return rows as BookLoan[];
};

export const getLoanByIdAndMember = async (
  loanId: number | string,
  memberId: number | string,
  memberEmail: string
) => {
  const [rows] = await pool.execute(
    `SELECT * FROM book_loans WHERE id = ? AND (member_id = ? OR member_email = ?)`,
    [loanId, memberId, memberEmail]
  );
  return rows as BookLoan[];
};

export const findExistingActiveLoan = async (
  bookCode: string,
  memberId: number | string,
  memberEmail: string
) => {
  const [rows] = await pool.execute(
    `SELECT * FROM book_loans WHERE book_code = ? AND (member_id = ? OR member_email = ?)
     AND status <> 'returned' ORDER BY id DESC LIMIT 1`,
    [bookCode, memberId, memberEmail]
  );
  return rows as BookLoan[];
};

export const createLoan = async (
  bookCode: string,
  title: string,
  author: string | null,
  rackLocation: string | null,
  memberId: number | string | null,
  memberName: string | null,
  memberEmail: string | null,
  borrowDate: string,
  dueDate: string
) => {
  const [result] = await pool.execute(
    `INSERT INTO book_loans
     (book_code, title, author, rack_location, member_id, member_name, member_email, borrow_date, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [bookCode, title, author, rackLocation, memberId, memberName, memberEmail, borrowDate, dueDate]
  );
  return result as any;
};

export const requestExtension = async (extensionDays: number, id: any) => {
  const [result] = await pool.execute(
    `UPDATE book_loans SET extension_status = 'pending', extension_days = ?, extension_requested_at = NOW()
     WHERE id = ?`,
    [extensionDays, id]
  );
  return result as any;
};

export const getLoanById = async (id: any) => {
  const [rows] = await pool.execute('SELECT * FROM book_loans WHERE id = ?', [id]);
  return rows as BookLoan[];
};

export const getAllLoans = async () => {
  const [rows] = await pool.query('SELECT * FROM book_loans ORDER BY created_at DESC');
  return rows as BookLoan[];
};

export const returnLoan = async (id: any) => {
  const [result] = await pool.execute(
    `UPDATE book_loans SET status = 'returned', returned_at = NOW(), extension_status = 'none' WHERE id = ?`,
    [id]
  );
  return result as any;
};

export const approveExtension = async (id: any) => {
  const [result] = await pool.execute(
    `UPDATE book_loans SET due_date = DATE_ADD(due_date, INTERVAL COALESCE(extension_days, 7) DAY),
     extension_status = 'approved', extension_reviewed_at = NOW(), status = 'active' WHERE id = ?`,
    [id]
  );
  return result as any;
};

export const rejectExtension = async (id: any) => {
  const [result] = await pool.execute(
    `UPDATE book_loans SET extension_status = 'rejected', extension_reviewed_at = NOW() WHERE id = ?`,
    [id]
  );
  return result as any;
};
