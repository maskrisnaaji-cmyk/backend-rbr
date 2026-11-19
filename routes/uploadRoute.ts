import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  uploadFile,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} from '../controllers/uploadController';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    callback(null, true);
  },
});

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Ukuran file maksimal 5 MB.' });
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Format file harus JPG, JPEG, PNG, atau WEBP.' });
    }
    return next(err);
  });
}, uploadFile);

export default router;
module.exports = router;
