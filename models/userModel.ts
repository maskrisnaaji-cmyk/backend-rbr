import pool from '../config/db';

export interface User {
  id?: number;
  name: string;
  email: string;
  phone?: string | null;
  password?: string;
  role: 'admin' | 'user' | string;
  is_verified?: number | boolean;
  security_pin?: string;
  createdAt?: Date | string;
  visit_count?: number;
  visits?: string;
  status?: string;
}

/**
 * Older databases may not have received the member-verification migration.
 * Keep this operation idempotent without relying on ADD COLUMN IF NOT EXISTS,
 * which is not supported consistently by all MySQL-compatible servers.
 */
const ensureVerificationColumn = async () => {
  // Inisialisasi kolom tabel users ditangani di init_db.ts
  return;
};

export const findUserEmailOnly = async (email: string) => {
  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );
  return rows as User[];
};

export const findUserForLogin = async (email: string) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, password, role FROM users WHERE email = ?',
    [email]
  );
  return rows as User[];
};

export const findUserForGoogleLogin = async (email: string) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role FROM users WHERE email = ?',
    [email]
  );
  return rows as User[];
};

export const createUser = async (
  name: string,
  email: string,
  phone: string | null,
  passwordHash: string,
  role: string
) => {
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, phone, passwordHash, role]
  );
  return result as any;
};

export const createGoogleUser = async (
  name: string,
  email: string,
  passwordHash: string,
  role: string
) => {
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role]
  );
  return result as any;
};

export const findUserByIdentifier = async (trimmedIdentifier: string) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, security_pin FROM users WHERE email = ? OR name = ? OR id = ?',
    [trimmedIdentifier, trimmedIdentifier, trimmedIdentifier]
  );
  return rows as User[];
};

export const findUserByIdentifierForReset = async (trimmedIdentifier: string) => {
  const [rows] = await pool.execute(
    'SELECT id, security_pin FROM users WHERE email = ? OR name = ? OR id = ?',
    [trimmedIdentifier, trimmedIdentifier, trimmedIdentifier]
  );
  return rows as User[];
};

export const findUserByEmailAndPhone = async (email: string, phone: string) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND TRIM(phone) = TRIM(?) LIMIT 1',
    [email, phone]
  );
  return rows as User[];
};

export const updateUserPassword = async (hashedPassword: string, targetUserId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE users SET password = ? WHERE id = ?',
    [hashedPassword, targetUserId]
  );
  return result as any;
};

export const findUserByEmailOrPhone = async (identifier: string) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone FROM users WHERE email = ? OR phone = ? LIMIT 1',
    [identifier, identifier]
  );
  return rows as User[];
};

export const updateUserName = async (candidateName: string, userId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE users SET name = ? WHERE id = ?',
    [candidateName, userId]
  );
  return result as any;
};

export const searchUsers = async (keyword: string) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?',
    [keyword, keyword, keyword]
  );
  return rows as User[];
};

export const getAllMembers = async () => {
  try {
    // The activity tables and is_verified column are created by init_db. Keep
    // the richer query as the fast path, but do not make the admin member list
    // unusable when an older database has not run all migrations yet.
    const [rows] = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        COALESCE(u.is_verified, 0) AS is_verified,
        u.createdAt,
        (
          (SELECT COUNT(*) FROM transactions t WHERE t.customer_email = u.email AND (t.order_type = 'kedai' OR t.order_type IS NULL)) +
          (SELECT COUNT(*) FROM ticket_transactions tt WHERE tt.customer_email = u.email) +
          (SELECT COUNT(*) FROM book_loans bl WHERE bl.member_id = u.id OR bl.member_email = u.email)
        ) AS visit_count
      FROM users u
      WHERE u.role = 'user'
      ORDER BY u.id DESC
    `);
    return rows as User[];
  } catch (err: any) {
    console.warn('[getAllMembers] Falling back to the core users query:', err.message);

    // Compatibility path for databases created before the member/activity
    // migrations. The member page can still load and verification remains
    // available once the users table contains is_verified.
    const [rows] = await pool.query(`
      SELECT id, name, email, NULL AS phone, role,
             0 AS is_verified, NULL AS createdAt, 0 AS visit_count
      FROM users
      WHERE role = 'user'
      ORDER BY id DESC
    `);
    return rows as User[];
  }
};

export const getUserById = async (id: number | string) => {
  await ensureVerificationColumn();
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, is_verified, createdAt FROM users WHERE id = ?',
    [id]
  );
  return rows as User[];
};

export const getUserByEmail = async (email: string) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, is_verified, createdAt FROM users WHERE email = ?',
    [email]
  );
  return rows as User[];
};

export const updateUserVerification = async (id: number | string, isVerified: number | boolean | string) => {
  const statusVal = (isVerified === true || isVerified === 1 || String(isVerified) === '1' || String(isVerified) === 'true') ? 1 : 0;
  await ensureVerificationColumn();
  const [result] = await pool.execute(
    'UPDATE users SET is_verified = ? WHERE id = ?',
    [statusVal, id]
  );
  return result as any;
};

export const deleteUserById = async (id: number | string) => {
  const [result] = await pool.execute(
    'DELETE FROM users WHERE id = ?',
    [id]
  );
  return result as any;
};
