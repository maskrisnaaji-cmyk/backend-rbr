const express = require('express');
const multer = require('multer');
const {
  uploadFile,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
} = require('../controllers/uploadController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, callback) => {
    const extension = require('path').extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    callback(null, true);
  },
});

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
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

module.exports = router;
