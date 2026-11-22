import pool from '../config/db';

export interface Menu {
  id?: number;
  name: string;
  category: string;
  price: number;
  description: string;
  image?: string | null;
  status: string;
  is_available: boolean | number;
}

export const getAllMenusQuery = async (sql: string, params: any[]) => {
  const [rows] = await pool.query(sql, params);
  return rows as Menu[];
};

export const getMenuById = async (id: any) => {
  const [rows] = await pool.execute('SELECT * FROM menus WHERE id = ?', [id]);
  return rows as Menu[];
};

export const insertMenuWithAvailability = async (
  name: string,
  category: string,
  price: number,
  description: string,
  image: string,
  finalStatus: string,
  isAvailable: number
) => {
  const [insertRes] = await pool.execute(
    'INSERT INTO menus (name, category, price, description, image, status, is_available) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      name,
      category || 'Kopi Nusantara',
      Number(price) || 0,
      description || '',
      image || '',
      finalStatus,
      isAvailable ? 1 : 0,
    ]
  );
  return insertRes as any;
};

export const insertMenuWithoutAvailability = async (
  name: string,
  category: string,
  price: number,
  description: string,
  image: string,
  finalStatus: string
) => {
  const [insertRes] = await pool.execute(
    'INSERT INTO menus (name, category, price, description, image, status) VALUES (?, ?, ?, ?, ?, ?)',
    [
      name,
      category || 'Kopi Nusantara',
      Number(price) || 0,
      description || '',
      image || '',
      finalStatus,
    ]
  );
  return insertRes as any;
};

export const updateMenuWithAvailability = async (
  name: string,
  category: string,
  price: number,
  description: string,
  image: string,
  nextStatus: string,
  nextAvailable: boolean | number,
  id: any
) => {
  const [result] = await pool.execute(
    'UPDATE menus SET name = ?, category = ?, price = ?, description = ?, image = ?, status = ?, is_available = ? WHERE id = ?',
    [
      name,
      category,
      price,
      description,
      image,
      nextStatus,
      nextAvailable ? 1 : 0,
      id,
    ]
  );
  return result as any;
};

export const updateMenuWithoutAvailability = async (
  name: string,
  category: string,
  price: number,
  description: string,
  image: string,
  nextStatus: string,
  id: any
) => {
  const [result] = await pool.execute(
    'UPDATE menus SET name = ?, category = ?, price = ?, description = ?, image = ?, status = ? WHERE id = ?',
    [
      name,
      category,
      price,
      description,
      image,
      nextStatus,
      id,
    ]
  );
  return result as any;
};

export const patchMenuStatusWithAvailability = async (
  nextAvailable: boolean | number,
  nextStatus: string,
  id: any
) => {
  const [result] = await pool.execute(
    'UPDATE menus SET is_available = ?, status = ? WHERE id = ?',
    [nextAvailable ? 1 : 0, nextStatus, id]
  );
  return result as any;
};

export const patchMenuStatusWithoutAvailability = async (
  nextStatus: string,
  id: any
) => {
  const [result] = await pool.execute(
    'UPDATE menus SET status = ? WHERE id = ?',
    [nextStatus, id]
  );
  return result as any;
};

export const deleteMenu = async (id: any) => {
  const [result] = await pool.execute('DELETE FROM menus WHERE id = ?', [id]);
  return result as any;
};

export const updateMenuImage = async (url: string, entityId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE menus SET image = ? WHERE id = ?',
    [url, entityId]
  );
  return result as any;
};
