import { Request, Response } from 'express';
import {
  syncOverdueStatus,
  getLoansByMember,
  getLoanByIdAndMember,
  findExistingActiveLoan,
  createLoan,
  requestExtension as requestExtensionModel,
  getLoanById,
  getAllLoans as getAllLoansModel,
  returnLoan,
  approveExtension,
  rejectExtension,
  findActiveLoanByBook,
  approveLoanRequest,
  rejectLoanRequest,
} from '../models/loanModel';
import { updateBookStatus, getBookByCodeOrTitle, syncBookAvailabilityModel } from '../models/bookModel';
import { createUserNotification } from '../models/notificationModel';
import { AuthRequest, extractUserId } from '../middleware/authMiddleware';

const mapLoan = (loan: any) => ({
  ...loan,
  borrow_date: loan.borrow_date?.toISOString?.().slice(0, 10) || loan.borrow_date,
  due_date: loan.due_date?.toISOString?.().slice(0, 10) || loan.due_date,
});

export const getMyLoans = async (req: Request, res: Response) => {
  try {
    await syncOverdueStatus();
    await syncBookAvailabilityModel().catch(() => null);
    const user = (req as any).user;
    const rows = await getLoansByMember(user.id, user.email);
    res.json(rows.map(mapLoan));
  } catch (err) {
    console.error('[getMyLoans]', err);
    res.status(500).json({ message: 'Gagal mengambil data peminjaman.' });
  }
};

export const requestExtension = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
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

    let loan: any;
    if (loanId) {
      const rows = await getLoanByIdAndMember(loanId, user.id, user.email);
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
      const existing = await findExistingActiveLoan(bookCode, user.id, user.email);
      loan = existing[0];
    }

    if (!loan) {
      const created = await createLoan(
        bookCode,
        title,
        author || null,
        rackLocation || null,
        user.id,
        user.name,
        user.email,
        borrowDate,
        dueDate
      );
      loan = { id: created.insertId, status: 'active', extension_status: 'none' };
    }

    await requestExtensionModel(Number(extensionDays) || 7, loan.id);

    const updated = await getLoanById(loan.id);
    res.status(201).json({ message: 'Request perpanjangan dikirim ke admin.', data: mapLoan(updated[0]) });
  } catch (err) {
    console.error('[requestExtension]', err);
    res.status(500).json({ message: 'Gagal mengirim request perpanjangan.' });
  }
};

export const requestLoan = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      bookCode,
      title,
      author,
      rackLocation,
      borrowDate,
      dueDate,
      memberName,
      memberEmail,
      memberPhone,
      identityNumber,
      notes,
    } = req.body;

    if (!bookCode || !title) {
      return res.status(400).json({ message: 'Kode buku dan judul buku wajib diisi.' });
    }

    // 1. Validasi ketersediaan buku di tabel books
    const bookRows = await getBookByCodeOrTitle(bookCode, title);
    const targetBook = bookRows && bookRows.length > 0 ? bookRows[0] : null;

    if (targetBook) {
      const currentStatus = (targetBook.status || '').trim().toUpperCase();
      if (currentStatus === 'DIPINJAM' || currentStatus === 'DISEWAKAN' || currentStatus.includes('PINJAM')) {
        return res.status(400).json({
          message: `Buku '${targetBook.title || title}' saat ini sedang DIPINJAM dan tidak tersedia untuk dipinjam ganda.`,
        });
      }
    }

    // 2. Validasi transaksi aktif di book_loans untuk mencegah peminjaman ganda
    const activeLoans = await findActiveLoanByBook(bookCode, title);
    if (activeLoans && activeLoans.length > 0) {
      return res.status(400).json({
        message: `Buku '${title}' sedang dalam transaksi peminjaman aktif dan tidak dapat dipinjam ganda.`,
      });
    }

    const userId = extractUserId(req as AuthRequest);
    const name = memberName || user?.name || 'Anggota Pustaka';
    const email = memberEmail || user?.email || 'anggota@rumahbudayaratna.id';
    const today = borrowDate || new Date().toISOString().slice(0, 10);
    const due = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const created = await createLoan(
      bookCode,
      title,
      author || targetBook?.author || null,
      rackLocation || targetBook?.rack_location || null,
      userId,
      name,
      email,
      today,
      due
    );

    // Perbarui status ketersediaan buku di tabel books menjadi DIPINJAM dan catat nama peminjam
    try {
      await updateBookStatus('DIPINJAM', bookCode, title, name);
    } catch (updateErr: any) {
      console.warn('[requestLoan] Gagal update status buku:', updateErr.message);
    }

    // Otomatis simpan notifikasi peminjaman buku
    try {
      await createUserNotification({
        userId,
        orderId: `LOAN-${created.insertId}`,
        title: 'Peminjaman Buku Berhasil',
        message: `Buku '${title}' berhasil diajukan untuk dipinjam.`,
        type: 'book',
        orderStatus: 'Dipinjam',
        email,
        phone: memberPhone || null,
      });
    } catch (_) {}

    const rows = await getLoanById(created.insertId);
    res.status(201).json({
      message: 'Pengajuan peminjaman berhasil dikirim.',
      data: mapLoan(rows[0]),
    });
  } catch (err) {
    console.error('[requestLoan]', err);
    res.status(500).json({ message: 'Gagal mengajukan peminjaman buku.' });
  }
};

export const getAllLoans = async (_req: Request, res: Response) => {
  try {
    await syncOverdueStatus();
    await syncBookAvailabilityModel().catch(() => null);
    const rows = await getAllLoansModel();
    res.json(rows.map(mapLoan));
  } catch (err) {
    console.error('[getAllLoans]', err);
    res.status(500).json({ message: 'Gagal mengambil daftar peminjaman.' });
  }
};

export const updateLoan = async (req: Request, res: Response) => {
  try {
    const { action } = req.body;
    const rows = await getLoanById(req.params.id);
    const loan: any = rows[0];
    if (!loan) return res.status(404).json({ message: 'Peminjaman tidak ditemukan.' });

    if (action === 'return') {
      // 1. Pengembalian Buku: Ubah status loan menjadi returned dan kembalikan status buku ke TERSEDIA
      await returnLoan(loan.id);
      try {
        await updateBookStatus('TERSEDIA', loan.book_code, loan.title, '-');
      } catch (_) {}
      try {
        await createUserNotification({
          userId: loan.member_id || null,
          orderId: `LOAN-${loan.id}`,
          title: 'Buku Telah Dikembalikan',
          message: `Buku '${loan.title}' sudah dikembalikan. Terima kasih!`,
          type: 'book',
          orderStatus: 'Dikembalikan',
          email: loan.member_email || null,
        });
      } catch (_) {}
    } else if (action === 'reject_request' || action === 'reject' || action === 'cancel' || action === 'batal') {
      // 2. Penolakan / Pembatalan Peminjaman: Ubah status loan menjadi rejected dan kembalikan status buku ke TERSEDIA
      await rejectLoanRequest(loan.id);
      try {
        await updateBookStatus('TERSEDIA', loan.book_code, loan.title, '-');
      } catch (_) {}
      try {
        await createUserNotification({
          userId: loan.member_id || null,
          orderId: `LOAN-${loan.id}`,
          title: 'Peminjaman Ditolak / Dibatalkan',
          message: `Pengajuan peminjaman untuk buku '${loan.title}' ditolak / dibatalkan.`,
          type: 'book',
          orderStatus: 'Ditolak',
          email: loan.member_email || null,
        });
      } catch (_) {}
    } else if (action === 'approve_request') {
      // 3. Persetujuan Peminjaman oleh Admin
      await approveLoanRequest(loan.id);
      try {
        await updateBookStatus('DIPINJAM', loan.book_code, loan.title, loan.member_name || 'Anggota Pustaka');
      } catch (_) {}
      try {
        await createUserNotification({
          userId: loan.member_id || null,
          orderId: `LOAN-${loan.id}`,
          title: 'Peminjaman Disetujui',
          message: `Pengajuan peminjaman buku '${loan.title}' telah disetujui.`,
          type: 'book',
          orderStatus: 'Disetujui',
          email: loan.member_email || null,
        });
      } catch (_) {}
    } else if (action === 'approve_extension') {
      if (loan.extension_status !== 'pending') {
        return res.status(400).json({ message: 'Tidak ada request perpanjangan yang menunggu.' });
      }
      await approveExtension(loan.id);
    } else if (action === 'reject_extension') {
      await rejectExtension(loan.id);
    } else {
      return res.status(400).json({ message: 'Aksi tidak dikenal.' });
    }

    const updated = await getLoanById(loan.id);
    res.json({ message: 'Status peminjaman diperbarui.', data: mapLoan(updated[0]) });
  } catch (err) {
    console.error('[updateLoan]', err);
    res.status(500).json({ message: 'Gagal memperbarui status peminjaman.' });
  }
};

export const syncLoansStatus = async (_req: Request, res: Response) => {
  try {
    await syncOverdueStatus();
    await syncBookAvailabilityModel();
    res.json({ message: 'Sinkronisasi status peminjaman dan ketersediaan buku berhasil.' });
  } catch (err) {
    console.error('[syncLoansStatus]', err);
    res.status(500).json({ message: 'Gagal melakukan sinkronisasi status peminjaman.' });
  }
};
