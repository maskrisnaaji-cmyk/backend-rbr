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

export const getUnreadNotificationsCount = async (customQuery?: string, params?: any[]) => {
  const query = customQuery || 'SELECT COUNT(*) as count FROM notifications WHERE is_read = 0';
  const queryParams = params || [];
  const [unreadRows] = await pool.query(query, queryParams);
  return (unreadRows as any[])[0]?.count || 0;
};

export const markNotificationAsRead = async (id: any) => {
  const [result] = await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  return result as any;
};

export const markAllNotificationsAsRead = async (userId?: number | null) => {
  if (userId) {
    const [result] = await pool.execute(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL',
      [userId]
    );
    return result as any;
  }
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

/**
 * Helper reusable untuk membuat notifikasi user tanpa duplikasi
 * berdasarkan userId, title, dan message (serta orderId jika ada).
 */
export const resolveUserId = async (
  userId: number | string | null | undefined,
  email?: string | null,
  phone?: string | null
): Promise<number | null> => {
  if (userId) {
    const parsed = Number(userId);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  if (email || phone) {
    const conditions: string[] = [];
    const params: any[] = [];
    if (email) {
      conditions.push('email = ?');
      params.push(email);
    }
    if (phone) {
      conditions.push('phone = ?');
      params.push(phone);
    }
    const [rows]: any = await pool.query(
      `SELECT id FROM users WHERE ${conditions.join(' OR ')} LIMIT 1`,
      params
    );
    if (rows && rows.length > 0) {
      return Number(rows[0].id);
    }
  }

  return null;
};

export const createUserNotification = async ({
  userId,
  title,
  message,
  type = 'general',
  orderId = null,
  orderStatus = 'Info',
  email = null,
  phone = null,
}: {
  userId: number | string | null | undefined;
  title: string;
  message: string;
  type?: string;
  orderId?: string | null;
  orderStatus?: string;
  email?: string | null;
  phone?: string | null;
}) => {
  const resolvedUserId = await resolveUserId(userId, email, phone);
  if (!resolvedUserId) return null;

  const [existing] = await pool.query(
    orderId
      ? 'SELECT id FROM notifications WHERE user_id = ? AND title = ? AND order_id = ? LIMIT 1'
      : 'SELECT id FROM notifications WHERE user_id = ? AND title = ? AND message = ? LIMIT 1',
    orderId ? [resolvedUserId, title, orderId] : [resolvedUserId, title, message]
  );

  if ((existing as any[]).length > 0) {
    return null;
  }

  const [result] = await pool.execute(
    `INSERT INTO notifications (user_id, order_id, title, message, type, order_status, is_read)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [resolvedUserId, orderId, title, message, type, orderStatus]
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
