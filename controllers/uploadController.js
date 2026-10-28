const path = require('path');
const pool = require('../config/db');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const validateUploadTarget = (req) => {
  const entity = (req.body.entity || req.body.type || '').toLowerCase();
  const entityId = req.body.entityId || req.body.id;

  if (!entity && !entityId) return { entity: null, entityId: null };
  if (!['event', 'ticket'].includes(entity)) {
    const error = new Error('Target upload harus berupa event atau ticket.');
    error.statusCode = 400;
    throw error;
  }
  if (!entityId || !/^\d+$/.test(String(entityId))) {
    const error = new Error('entityId wajib berupa ID numerik.');
    error.statusCode = 400;
    throw error;
  }

  return { entity, entityId: Number(entityId) };
};

const persistUploadedUrl = async ({ entity, entityId, url }) => {
  if (!entity) return;

  if (entity === 'event') {
    const [result] = await pool.execute(
      'UPDATE events SET banner_image = ?, image = ? WHERE id = ?',
      [url, url, entityId]
    );
    if (result.affectedRows === 0) {
      const error = new Error('Event tidak ditemukan.');
      error.statusCode = 404;
      throw error;
    }
    return;
  }

  const [result] = await pool.execute(
    'UPDATE ticket_transactions SET payment_proof = ? WHERE id = ?',
    [url, entityId]
  );
  if (result.affectedRows === 0) {
    const error = new Error('Transaksi tiket tidak ditemukan.');
    error.statusCode = 404;
    throw error;
  }
};

// POST /api/upload
const uploadFile = async (req, res) => {
  try {
    const target = validateUploadTarget(req);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'File wajib diunggah pada field file.' });
    }
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ message: 'Ukuran file maksimal 5 MB.' });
    }

    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({ message: 'Format file harus JPG, JPEG, PNG, atau WEBP.' });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('[uploadFile] BLOB_READ_WRITE_TOKEN belum dikonfigurasi.');
      return res.status(500).json({ message: 'Konfigurasi cloud storage belum tersedia.' });
    }

    // Hindari path traversal dan karakter nama yang tidak perlu pada object key.
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '-');
    const { put } = await import('@vercel/blob');
    const blob = await put(`uploads/${Date.now()}-${safeName}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    await persistUploadedUrl({ ...target, url: blob.url });
    return res.json({ status: 'success', url: blob.url });
  } catch (err) {
    console.error('[uploadFile]', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      message: statusCode === 500 ? 'Gagal mengunggah file ke Vercel Blob.' : err.message,
    });
  }
};

module.exports = { uploadFile, MAX_FILE_SIZE, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES };
