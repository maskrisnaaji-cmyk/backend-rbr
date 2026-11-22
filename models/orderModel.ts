import pool from '../config/db';

export interface Order {
  id: string;
  order_code: string;
  table_number: string;
  items: string;
  total_price: number;
  total?: string | null;
  payment_status: 'UNPAID' | 'PAID' | string;
  order_status: 'Menunggu' | 'Disiapkan' | 'Selesai' | string;
  status: 'menunggu' | 'disiapkan' | 'selesai' | 'diantar' | string;
  time?: string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
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
  orderTime: string
) => {
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
