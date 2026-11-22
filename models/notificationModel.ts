import pool from '../config/db';

export interface Notification {
  id?: number;
  user_id?: number | null;
  order_id?: string | null;
  title: string;
  message: string;
  type: string;
  order_status: string;
  is_read: number | boolean;
  created_at?: Date | string;
}

export const getNotificationsQuery = async (query: string, params: any[]) => {
  const [rows] = await pool.query(query, params);
  return rows as Notification[];
};

export const getUnreadNotificationsCount = async () => {
  const [unreadRows] = await pool.query(
    'SELECT COUNT(*) as count FROM notifications WHERE is_read = 0'
  );
  return (unreadRows as any[])[0]?.count || 0;
};

export const markNotificationAsRead = async (id: any) => {
  const [result] = await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  return result as any;
};

export const markAllNotificationsAsRead = async () => {
  const [result] = await pool.execute('UPDATE notifications SET is_read = 1');
  return result as any;
};

export const createNotification = async (
  userId: any,
  orderId: any,
  title: string,
  message: string,
  type: string,
  orderStatus: string
) => {
  const [result] = await pool.execute(
    `INSERT INTO notifications (user_id, order_id, title, message, type, order_status, is_read)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [userId, orderId, title, message, type, orderStatus]
  );
  return result as any;
};

export const getNotificationById = async (id: any) => {
  const [rows] = await pool.execute('SELECT * FROM notifications WHERE id = ?', [id]);
  return rows as Notification[];
};

export const getLatestOrderNotification = async (orderId: any) => {
  const [latestNotif] = await pool.query(
    'SELECT order_status FROM notifications WHERE order_id = ? ORDER BY id DESC LIMIT 1',
    [orderId]
  );
  return latestNotif as Notification[];
};
