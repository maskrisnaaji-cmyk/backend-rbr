import pool from '../config/db';

export interface User {
  id?: number;
  name: string;
  email: string;
  phone?: string | null;
  password?: string;
  role: 'admin' | 'user' | string;
  security_pin?: string;
  createdAt?: Date | string;
}

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
