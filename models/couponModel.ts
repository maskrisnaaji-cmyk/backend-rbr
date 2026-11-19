import pool from '../config/db';

export interface Coupon {
  id?: number;
  code: string;
  description?: string;
  desc?: string;
  status: string;
  theme: string;
  created_at?: Date | string;
}

export const getAllCoupons = async () => {
  const [rows] = await pool.query(
    'SELECT id, code, description AS `desc`, status, theme, created_at FROM coupons ORDER BY id ASC'
  );
  return rows as Coupon[];
};

export const createCoupon = async (
  code: string,
  description: string,
  status: string,
  theme: string
) => {
  const [result] = await pool.execute(
    'INSERT INTO coupons (code, description, status, theme) VALUES (?, ?, ?, ?)',
    [code, description, status, theme]
  );
  return result as any;
};

export const getCouponById = async (id: any) => {
  const [rows] = await pool.execute(
    'SELECT id, code, description AS `desc`, status, theme, created_at FROM coupons WHERE id = ?',
    [id]
  );
  return rows as Coupon[];
};

export const deleteCoupon = async (id: any) => {
  const [result] = await pool.execute('DELETE FROM coupons WHERE id = ?', [id]);
  return result as any;
};
