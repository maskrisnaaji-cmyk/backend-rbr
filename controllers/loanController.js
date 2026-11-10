const pool = require('../config/db');

const syncOverdueStatus = async () => {
  await pool.execute(
    "UPDATE book_loans SET status = 'overdue' WHERE status = 'active' AND due_date < CURDATE()"
  );
};

const mapLoan = (loan) => ({
  ...loan,
  borrow_date: loan.borrow_date?.toISOString?.().slice(0, 10) || loan.borrow_date,
  due_date: loan.due_date?.toISOString?.().slice(0, 10) || loan.due_date,
});

const getMyLoans = async (req, res) => {
  try {
    await syncOverdueStatus();
    const [rows] = await pool.execute(
      `SELECT * FROM book_loans
       WHERE member_id = ? OR (member_id IS NULL AND member_email = ?)
       ORDER BY due_date ASC`,
      [req.user.id, req.user.email]
    );
    res.json(rows.map(mapLoan));
  } catch (err) {
    console.error('[getMyLoans]', err);
    res.status(500).json({ message: 'Gagal mengambil data peminjaman.' });
  }
};

const requestExtension = async (req, res) => {
  try {
    const {
      loanId,
      bookCode,
      title,
      author,
      rackLocation,
      borrowDate,
      dueDate,
      extensionDays = 7,
    } = req.body;

    // Jika loanId tersedia, detail peminjaman diambil dari database.
    // Detail lengkap hanya wajib saat membuat record peminjaman baru.
    if (!loanId && (!bookCode || !title || !borrowDate || !dueDate)) {
      return res.status(400).json({ message: 'Data peminjaman belum lengkap.' });
    }

    let loan;
    if (loanId) {
      const [rows] = await pool.execute(
        `SELECT * FROM book_loans WHERE id = ? AND (member_id = ? OR member_email = ?)`,
        [loanId, req.user.id, req.user.email]
      );
      loan = rows[0];
      if (!loan) return res.status(404).json({ message: 'Peminjaman tidak ditemukan.' });
    }

    if (loan && loan.status === 'returned') {
      return res.status(400).json({ message: 'Buku yang sudah dikembalikan tidak dapat diperpanjang.' });
    }
    if (loan && loan.extension_status === 'pending') {
      return res.status(409).json({ message: 'Request perpanjangan sedang menunggu konfirmasi admin.' });
    }

    if (!loan) {
      const [existing] = await pool.execute(
        `SELECT * FROM book_loans WHERE book_code = ? AND (member_id = ? OR member_email = ?)
         AND status <> 'returned' ORDER BY id DESC LIMIT 1`,
        [bookCode, req.user.id, req.user.email]
      );
      loan = existing[0];
    }

    if (!loan) {
      const [created] = await pool.execute(
        `INSERT INTO book_loans
         (book_code, title, author, rack_location, member_id, member_name, member_email, borrow_date, due_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [bookCode, title, author || null, rackLocation || null, req.user.id, req.user.name, req.user.email, borrowDate, dueDate]
      );
      loan = { id: created.insertId, status: 'active', extension_status: 'none' };
    }

    await pool.execute(
      `UPDATE book_loans SET extension_status = 'pending', extension_days = ?, extension_requested_at = NOW()
       WHERE id = ?`,
      [Number(extensionDays) || 7, loan.id]
    );

    const [updated] = await pool.execute('SELECT * FROM book_loans WHERE id = ?', [loan.id]);
    res.status(201).json({ message: 'Request perpanjangan dikirim ke admin.', data: mapLoan(updated[0]) });
  } catch (err) {
    console.error('[requestExtension]', err);
    res.status(500).json({ message: 'Gagal mengirim request perpanjangan.' });
  }
};

const getAllLoans = async (_req, res) => {
  try {
    await syncOverdueStatus();
    const [rows] = await pool.query('SELECT * FROM book_loans ORDER BY created_at DESC');
    res.json(rows.map(mapLoan));
  } catch (err) {
    console.error('[getAllLoans]', err);
    res.status(500).json({ message: 'Gagal mengambil daftar peminjaman.' });
  }
};

const updateLoan = async (req, res) => {
  try {
    const { action } = req.body;
    const [rows] = await pool.execute('SELECT * FROM book_loans WHERE id = ?', [req.params.id]);
    const loan = rows[0];
    if (!loan) return res.status(404).json({ message: 'Peminjaman tidak ditemukan.' });

    if (action === 'return') {
      await pool.execute(
        `UPDATE book_loans SET status = 'returned', returned_at = NOW(), extension_status = 'none' WHERE id = ?`,
        [loan.id]
      );
    } else if (action === 'approve_extension') {
      if (loan.extension_status !== 'pending') {
        return res.status(400).json({ message: 'Tidak ada request perpanjangan yang menunggu.' });
      }
      await pool.execute(
        `UPDATE book_loans SET due_date = DATE_ADD(due_date, INTERVAL COALESCE(extension_days, 7) DAY),
         extension_status = 'approved', extension_reviewed_at = NOW(), status = 'active' WHERE id = ?`,
        [loan.id]
      );
    } else if (action === 'reject_extension') {
      await pool.execute(
        `UPDATE book_loans SET extension_status = 'rejected', extension_reviewed_at = NOW() WHERE id = ?`,
        [loan.id]
      );
    } else {
      return res.status(400).json({ message: 'Aksi tidak dikenal.' });
    }

    const [updated] = await pool.execute('SELECT * FROM book_loans WHERE id = ?', [loan.id]);
    res.json({ message: 'Status peminjaman diperbarui.', data: mapLoan(updated[0]) });
  } catch (err) {
    console.error('[updateLoan]', err);
    res.status(500).json({ message: 'Gagal memperbarui status peminjaman.' });
  }
};

module.exports = { getMyLoans, requestExtension, getAllLoans, updateLoan };
