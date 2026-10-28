### 3️⃣ File README.md untuk backend (backend-rbr)

markdown
# Rumah Budaya Ratna - Backend REST API Service

Layanan API backend terpusat untuk platform **Rumah Budaya Ratna**. Bertanggung jawab menangani autentikasi pengguna, manajemen database, logika bisnis, serta integrasi data antara Web Admin dan Mobile Application.

## 🛠️ Deskripsi Proyek
Service ini dibangun menggunakan Node.js dan Express.js untuk menyediakan endpoint RESTful API yang aman, efisien, dan terstruktur.

## 📦 Daftar Library / Package yang Digunakan
- **Express.js** - Web Framework Node.js
- **Cors** - Cross-Origin Resource Sharing Middleware
- **Dotenv** - Environment Variable Management
- **JSON Web Token (JWT)** - Authentication
- **Bcrypt** - Password Hashing
- **Vercel Blob** - Penyimpanan file cloud untuk gambar dan bukti pembayaran
- **Multer** - Parsing multipart/form-data di memory
- **Nodemon** - Development Auto-restart

## 🚀 Panduan Menjalankan Aplikasi

Jalankan perintah berikut secara berurutan di terminal:

bash
git clone [https://github.com/maskrisnaaji-cmyk/backend-rbr.git](https://github.com/maskrisnaaji-cmyk/backend-rbr.git)
cd backend-rbr
npm install
npm run dev

Salin `.env.example` menjadi `.env`, lalu isi `BLOB_READ_WRITE_TOKEN` dari
Vercel Blob serta konfigurasi MySQL sebelum menjalankan server.

## Upload File

`POST /api/upload` menggunakan `multipart/form-data` dengan field `file`.
Format yang diterima JPG, JPEG, PNG, dan WEBP dengan ukuran maksimal 5 MB.

Upload umum:

```bash
curl -F "file=@banner.webp" http://localhost:5000/api/upload
```

Untuk langsung menyimpan URL ke event, tambahkan `entity=event` dan
`entityId=<id event>`. Untuk bukti pembayaran tiket, gunakan
`entity=ticket` dan `entityId=<id transaksi>`; URL akan disimpan ke
`ticket_transactions.payment_proof`.

Perintah `npm run dev` dan `npm start` otomatis memastikan database serta tabel
`users`, `menus`, `events`, dan `books` sudah tersedia sebelum server berjalan.
