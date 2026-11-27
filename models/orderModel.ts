import pool from '../config/db';

export interface Order {
  id: string;
  order_code: string;
  table_number: string;
  items: string;
  total_price: number;
  total?: string | null;
  payment_status: 'UNPAID' | 'PAID' | 'EXPIRED' | string;
  order_status: 'Menunggu' | 'Disiapkan' | 'Selesai' | 'Batal (Kedaluwarsa)' | string;
  status: 'menunggu' | 'disiapkan' | 'selesai' | 'diantar' | 'batal' | string;
  payment_method?: string | null;
  time?: string | null;
  user_id?: number | null;
  created_at?: Date | string;
  updated_at?: Date | string;
  expired_at?: Date | string | null;
}

export const getAllOrdersQuery = async (sql: string, params: any[]) => {
  const [rows] = await pool.query(sql, params);
  return rows as Order[];
};

export const getOrderByIdOrCode = async (id: any) => {
  const [rows] = await pool.execute(
    'SELECT * FROM orders WHERE id = ? OR order_code = ?',
    [id, id]
  );
  return rows as Order[];
};

export const insertOrUpdateOrder = async (
  rowId: string,
  tableNum: string,
  itemsJsonStr: string,
  calcPrice: number,
  totalFormatted: string,
  initialPaymentStatus: string,
  initialOrderStatus: string,
  initialStatus: string,
  orderTime: string,
  paymentMethod: string = 'kasir',
  expiredAt: Date | string | null = null,
  userId: number | null = null
) => {
  try {
    const [result] = await pool.execute(
      `INSERT INTO orders (id, order_code, table_number, items, total_price, total, payment_status, order_status, status, time, payment_method, expired_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         table_number = VALUES(table_number),
         items = VALUES(items),
         total_price = VALUES(total_price),
         total = VALUES(total),
         payment_status = VALUES(payment_status),
         order_status = VALUES(order_status),
         status = VALUES(status),
         time = VALUES(time),
         payment_method = VALUES(payment_method),
         expired_at = VALUES(expired_at),
         user_id = COALESCE(user_id, VALUES(user_id))`,
      [
        rowId,
        rowId,
        tableNum,
        itemsJsonStr,
        calcPrice,
        totalFormatted,
        initialPaymentStatus,
        initialOrderStatus,
        initialStatus,
        orderTime,
        paymentMethod,
        expiredAt,
        userId,
      ]
    );
    return result as any;
  } catch (err: any) {
    // Fallback jika kolom user_id / expired_at / payment_method belum ada
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.message?.includes('Unknown column')) {
      const [result] = await pool.execute(
        `INSERT INTO orders (id, order_code, table_number, items, total_price, total, payment_status, order_status, status, time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           table_number = VALUES(table_number),
           items = VALUES(items),
           total_price = VALUES(total_price),
           total = VALUES(total),
           payment_status = VALUES(payment_status),
           order_status = VALUES(order_status),
           status = VALUES(status),
           time = VALUES(time)`,
        [
          rowId,
          rowId,
          tableNum,
          itemsJsonStr,
          calcPrice,
          totalFormatted,
          initialPaymentStatus,
          initialOrderStatus,
          initialStatus,
          orderTime,
        ]
      );
      return result as any;
    }
    throw err;
  }
};

export const payOrderById = async (targetId: any) => {
  const [result] = await pool.execute(
    `UPDATE orders
     SET payment_status = 'PAID',
         order_status = 'Disiapkan',
         status = 'disiapkan'
     WHERE id = ?`,
    [targetId]
  );
  return result as any;
};

export const updateOrderStatusById = async (
  targetOrderStatus: string,
  targetStatus: string,
  targetId: any
) => {
  const [result] = await pool.execute(
    'UPDATE orders SET order_status = ?, status = ? WHERE id = ?',
    [targetOrderStatus, targetStatus, targetId]
  );
  return result as any;
};

export const updateOrderStatusByCode = async (
  orderDbStatus: string,
  orderUiStatus: string,
  orderId: any
) => {
  const [result] = await pool.execute(
    'UPDATE orders SET status = ?, order_status = ? WHERE id = ? OR order_code = ?',
    [orderDbStatus, orderUiStatus, orderId, orderId]
  );
  return result as any;
};

export const deleteOrderByIdOrCode = async (id: any) => {
  const [result] = await pool.execute(
    'DELETE FROM orders WHERE id = ? OR order_code = ?',
    [id, id]
  );
  return result as any;
};
