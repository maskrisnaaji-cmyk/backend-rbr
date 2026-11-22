import pool from '../config/db';

export interface Coupon {
  id?: number;
  code: string;
  desc?: string;
  description?: string;
  discount_type?: 'percent' | 'fixed' | string;
  discount_value?: number;
  target_member?: 'all' | 'verified' | string;
  is_active?: number | boolean;
  status: string;
  theme: string;
  created_at?: Date | string;
}

export const getAllCoupons = async () => {
  try {
    const [rows] = await pool.query(
      'SELECT id, code, `desc`, COALESCE(`desc`, description) AS description, discount_type, discount_value, target_member, is_active, status, theme, created_at FROM coupons ORDER BY id ASC'
    );
    return rows as Coupon[];
  } catch (err: any) {
    console.warn('[getAllCoupons] Falling back to the legacy coupons query:', err.message);

    // Older installations may have only the original code/description
    // columns. Keep the admin page readable until init_db has migrated them.
    try {
      const [rows] = await pool.query(
        `SELECT id, code, description AS \`desc\`, description,
                'percent' AS discount_type, 0 AS discount_value,
                'all' AS target_member, 1 AS is_active,
                'Aktif' AS status, 'maroon' AS theme,
                NULL AS created_at
         FROM coupons ORDER BY id ASC`
      );
      return rows as Coupon[];
    } catch (legacyErr: any) {
      console.warn('[getAllCoupons] Legacy query failed:', legacyErr.message);

      // A different early schema used `desc` instead of `description`.
      const [rows] = await pool.query(
        `SELECT id, code, \`desc\`, \`desc\` AS description,
                'percent' AS discount_type, 0 AS discount_value,
                'all' AS target_member, 1 AS is_active,
                'Aktif' AS status, 'maroon' AS theme,
                NULL AS created_at
         FROM coupons ORDER BY id ASC`
      );
      return rows as Coupon[];
    }
  }
};

export const createCoupon = async (
  code: string,
  desc: string,
  discountType: string = 'percent',
  discountValue: number = 0,
  targetMember: string = 'all',
  isActive: number = 1,
  status: string = 'Aktif',
  theme: string = 'maroon'
) => {
  const [result] = await pool.execute(
    'INSERT INTO coupons (code, `desc`, description, discount_type, discount_value, target_member, is_active, status, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [code, desc, desc, discountType, discountValue, targetMember, isActive, status, theme]
  );
  return result as any;
};

export const getCouponById = async (id: any) => {
  const [rows] = await pool.execute(
    'SELECT id, code, `desc`, COALESCE(`desc`, description) AS description, discount_type, discount_value, target_member, is_active, status, theme, created_at FROM coupons WHERE id = ?',
    [id]
  );
  return rows as Coupon[];
};

export const getCouponByCode = async (code: string) => {
  const [rows] = await pool.execute(
    'SELECT id, code, `desc`, COALESCE(`desc`, description) AS description, discount_type, discount_value, target_member, is_active, status, theme, created_at FROM coupons WHERE code = ?',
    [code]
  );
  return rows as Coupon[];
};

export const deleteCoupon = async (id: any) => {
  const [result] = await pool.execute('DELETE FROM coupons WHERE id = ?', [id]);
  return result as any;
};
