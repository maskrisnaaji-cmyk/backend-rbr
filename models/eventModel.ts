import pool from '../config/db';

export interface Event {
  id?: number;
  title: string;
  date: string;
  time: string;
  location: string;
  price: number;
  quota: number;
  sold: number;
  booked_count: number;
  status: 'Tiket Tersedia' | 'Tiket Penuh' | string;
  image?: string | null;
  banner_image?: string | null;
  category?: string | null;
}

export const getAllEvents = async () => {
  const [rows] = await pool.query('SELECT * FROM events ORDER BY id ASC');
  return rows as Event[];
};

export const getEventById = async (id: any) => {
  const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
  return rows as Event[];
};

export const getEventByIdForUpdate = async (connection: any, id: any) => {
  const [rows] = await connection.execute('SELECT * FROM events WHERE id = ? FOR UPDATE', [id]);
  return rows as Event[];
};

export const createEvent = async (
  title: string,
  date: string,
  time: string,
  location: string,
  price: number,
  quota: number,
  sold: number,
  bookedCount: number,
  status: string,
  image: string,
  bannerImage: string,
  category: string
) => {
  const [result] = await pool.execute(
    `INSERT INTO events (title, date, time, location, price, quota, sold, booked_count, status, image, banner_image, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      date,
      time,
      location,
      price,
      quota,
      sold,
      bookedCount,
      status,
      image,
      bannerImage,
      category,
    ]
  );
  return result as any;
};

export const updateEvent = async (
  title: string,
  date: string,
  time: string,
  location: string,
  price: number,
  quota: number,
  sold: number,
  bookedCount: number,
  status: string,
  image: string,
  bannerImage: string,
  category: string,
  id: any
) => {
  const [result] = await pool.execute(
    `UPDATE events
        SET title = ?, date = ?, time = ?, location = ?, price = ?,
            quota = ?, sold = ?, booked_count = ?, status = ?,
            image = ?, banner_image = ?, category = ?
      WHERE id = ?`,
    [
      title,
      date,
      time,
      location,
      price,
      quota,
      sold,
      bookedCount,
      status,
      image,
      bannerImage,
      category,
      id,
    ]
  );
  return result as any;
};

export const patchEventStatus = async (status: string, id: any) => {
  const [result] = await pool.execute(
    'UPDATE events SET status = ? WHERE id = ?',
    [status, id]
  );
  return result as any;
};

export const updateEventBooking = async (
  connection: any,
  sold: number,
  bookedCount: number,
  status: string,
  id: any
) => {
  const [result] = await connection.execute(
    'UPDATE events SET sold = ?, booked_count = ?, status = ? WHERE id = ?',
    [sold, bookedCount, status, id]
  );
  return result as any;
};

export const deleteEvent = async (id: any) => {
  const [result] = await pool.execute('DELETE FROM events WHERE id = ?', [id]);
  return result as any;
};

export const updateEventBannerAndImage = async (url: string, entityId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE events SET banner_image = ?, image = ? WHERE id = ?',
    [url, url, entityId]
  );
  return result as any;
};
