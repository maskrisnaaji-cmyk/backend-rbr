import { Request, Response } from 'express';
import pool from '../config/db';
import {
  createTransaction as createTransactionModel,
  createTicketTransaction,
  updateTransactionSettlement,
  updateTicketTransactionPaid,
  getTransactionByOrderId,
  updateTransactionStatus,
  updateTicketTransactionStatus,
  getTicketTransactionByOrderId,
} from '../models/transactionModel';
import { getCouponByCode } from '../models/couponModel';
import { getUserById, getUserByEmail } from '../models/userModel';

const midtransClient = require('midtrans-client');

// ─── Inisialisasi Midtrans Core API & Snap (Sandbox Mode) ───────────────────
const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-cNRPfg50s3Xc.ZQuesNEDHdv',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-server-cNRPfg50s3Xc.ZQuesNEDHdv',
});

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-cNRPfg50s3Xc.ZQuesNEDHdv',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-server-cNRPfg50s3Xc.ZQuesNEDHdv',
});

/**
 * Helper untuk memvalidasi kupon promo dan menghitung nilai diskon:
 * - Memeriksa keberadaan kode kupon (case-insensitive)
 * - Memeriksa status aktif kupon
 * - Memeriksa kepemilikan status Anggota Terverifikasi jika target_member === 'verified'
 * - Menghitung diskon persen maupun nominal fixed
 * - Memastikan gross_amount akhir minimal Rp 1 sesuai aturan Midtrans
 */
interface ApplyCouponParams {
  couponCode?: string;
  subtotal: number;
  userId?: number | string;
  customerEmail?: string;
}

interface ApplyCouponResult {
  valid: boolean;
  message?: string;
  coupon?: any;
  discountAmount: number;
}

export const applyCouponDiscount = async ({
  couponCode,
  subtotal,
  userId,
  customerEmail,
}: ApplyCouponParams): Promise<ApplyCouponResult> => {
  if (!couponCode || !String(couponCode).trim()) {
    return { valid: true, discountAmount: 0 };
  }

  const cleanCode = String(couponCode).trim().toUpperCase();
  const coupons = await getCouponByCode(cleanCode);

  if (!coupons || coupons.length === 0) {
    return {
      valid: false,
      message: `Kupon promo "${cleanCode}" tidak ditemukan atau tidak valid.`,
      discountAmount: 0,
    };
  }

  const coupon: any = coupons[0];

  // Periksa apakah kupon aktif
  const isActive = coupon.is_active === 1 || coupon.is_active === true || coupon.status === 'Aktif';
  if (!isActive) {
    return {
      valid: false,
      message: `Kupon promo "${cleanCode}" sudah tidak aktif atau kedaluwarsa.`,
      discountAmount: 0,
    };
  }

  // Periksa target member ('verified' vs 'all')
  const targetMember = String(coupon.target_member || 'all').toLowerCase();
  if (targetMember === 'verified' || targetMember === 'terverifikasi') {
    let user = null;
    if (userId) {
      const users = await getUserById(userId);
      if (users.length > 0) user = users[0];
    }
    if (!user && customerEmail) {
      const users = await getUserByEmail(customerEmail);
      if (users.length > 0) user = users[0];
    }

    const isUserVerified = user && (user.is_verified === 1 || user.is_verified === true || user.is_verified === '1');
    if (!isUserVerified) {
      return {
        valid: false,
        message: `Kupon promo "${cleanCode}" hanya berlaku untuk Anggota Terverifikasi. Silakan hubungi admin atau lengkapi verifikasi akun Anda.`,
        discountAmount: 0,
      };
    }
  }

  // Hitung besaran diskon
  let discountAmount = 0;
  const discValue = Number(coupon.discount_value) || 0;
  const discType = String(coupon.discount_type || 'percent').toLowerCase();

  if (discType === 'percent' || discType === 'percentage' || discType === '%') {
    discountAmount = Math.round((subtotal * discValue) / 100);
  } else {
    // Nominal tetap (fixed)
    discountAmount = Math.round(discValue);
  }

  // Aturan Midtrans: gross_amount minimal 1 rupiah, diskon tidak boleh membuat total <= 0
  if (discountAmount >= subtotal) {
    discountAmount = Math.max(0, subtotal - 1);
  }

  return {
    valid: true,
    coupon,
    discountAmount,
  };
};

/**
 * POST /api/payment/charge
 * Membuat transaksi charge langsung via Midtrans Core API:
 * - QRIS: menghasilkan qr_string dan url generate qr-code
 * - Bank Transfer VA: BCA, BNI, BRI, Mandiri (echannel), Permata -> menghasilkan nomor VA dinamis
 */
export const createCharge = async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      gross_amount,
      customer_name,
      customer_email,
      customer_phone,
      payment_type, // 'qris' atau 'bank_transfer'
      bank,         // 'bca', 'bni', 'bri', 'mandiri', 'permata'
      order_type,   // 'kedai' atau 'ticket'
      event_id,
      items,
      coupon_code,
      promo_code,
      user_id,
    } = req.body;

    const amount = Math.round(Number(gross_amount));
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal transaksi (gross_amount) wajib diisi dan harus lebih dari 0.',
      });
    }

    // Terapkan kupon promo jika diberikan
    const code = coupon_code || promo_code || req.body.code;
    let discountAmount = 0;
    let appliedCoupon = null;

    if (code) {
      const discountResult = await applyCouponDiscount({
        couponCode: code,
        subtotal: amount,
        userId: user_id,
        customerEmail: customer_email,
      });

      if (!discountResult.valid) {
        return res.status(400).json({
          success: false,
          message: discountResult.message,
        });
      }

      discountAmount = discountResult.discountAmount;
      appliedCoupon = discountResult.coupon;
    }

    const finalAmount = Math.max(1, amount - discountAmount);

    const cleanOrderId = (order_id && String(order_id).trim())
      ? String(order_id).trim().replace(/[^a-zA-Z0-9\-_]/g, '')
      : `RBR-${(order_type || 'ORD').toUpperCase()}-${Date.now()}`;

    const rawOrderType = (order_type || '').toLowerCase().trim();
    const isKedai = rawOrderType === 'kedai' ||
                    cleanOrderId.toUpperCase().startsWith('RBR-KEDAI') ||
                    cleanOrderId.toUpperCase().startsWith('RBR-ORD') ||
                    (!rawOrderType && !event_id);

    const pt = (payment_type || '').toLowerCase().trim();
    const isQris = pt === 'qris' || pt.includes('qris');
    const isCash = ['cash', 'kasir', 'tunai', 'bayar_di_kasir', 'bayar_kasir'].includes(pt);
    const isVa = ['bank_transfer', 'va', 'virtual_account', 'echannel', 'permata'].includes(pt);
    const bankName = (bank || 'bca').toLowerCase();

    // ── Validasi Metode Pembayaran Kedai: mendukung QRIS, Virtual Account (VA), dan Bayar di Kasir ──
    if (isKedai && !isQris && !isCash && !isVa) {
      return res.status(400).json({
        success: false,
        message: "Metode pembayaran tidak valid untuk pesanan Kedai. Mendukung 'QRIS', 'Virtual Account', dan 'Bayar di Kasir'.",
      });
    }

    // ── ATURAN 2: Simpan waktu server konsisten & batas waktu pembayaran 30 menit ──────
    const createdAt = new Date();
    const expiredAt = new Date(createdAt.getTime() + 30 * 60 * 1000);

    // ── Penanganan Khusus: "Bayar di Kasir" (Cash) untuk Kedai ────────────────────────
    if (isCash) {
      try {
        await createTransactionModel(
          cleanOrderId,
          'cash',
          'kasir',
          finalAmount,
          'pending',
          'pending',
          null,
          'kasir',
          null,
          null,
          customer_name || 'Pengunjung Kedai RBR',
          customer_email || 'customer@rumahbudayaratna.id',
          'kedai',
          items ? JSON.stringify(items) : '',
          expiredAt
        );
      } catch (dbErr: any) {
        console.warn('[paymentController] Simpan transactions (kasir) error:', dbErr.message);
      }

      try {
        await pool.query(
          `UPDATE orders
           SET payment_method = 'kasir',
               expired_at = COALESCE(expired_at, ?),
               updated_at = NOW()
           WHERE id = ? OR order_code = ?`,
          [expiredAt, cleanOrderId, cleanOrderId]
        );
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: 'Pesanan dengan metode Bayar di Kasir berhasil dibuat. Silakan lakukan pembayaran di kasir dalam 30 menit.',
        data: {
          order_id: cleanOrderId,
          payment_type: 'cash',
          payment_method: 'Bayar di Kasir',
          gross_amount: finalAmount,
          subtotal: amount,
          discount_amount: discountAmount,
          coupon_code: appliedCoupon ? appliedCoupon.code : null,
          transaction_status: 'pending',
          status: 'pending',
          created_at: createdAt.toISOString(),
          expired_at: expiredAt.toISOString(),
          expiry_duration_seconds: 1800,
          is_expired: false,
          is_paid: false,
        },
      });
    }

    let chargeParameter: any = {
      transaction_details: {
        order_id: cleanOrderId,
        gross_amount: finalAmount,
      },
      customer_details: {
        first_name: (customer_name && String(customer_name).trim()) || 'Pengunjung RBR',
        email: (customer_email && String(customer_email).trim()) || 'customer@rumahbudayaratna.id',
        phone: (customer_phone && String(customer_phone).trim()) || '081234567890',
      },
    };

    if (Array.isArray(items) && items.length > 0) {
      chargeParameter.item_details = items.map((item: any, idx: number) => ({
        id: String(item.id || idx + 1).substring(0, 50),
        price: Math.round(Number(item.price || item.harga || amount)),
        quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
        name: String(item.name || item.title || 'Pesanan RBR').substring(0, 50),
      }));

      // Tambahkan item promo berharga negatif jika ada diskon
      if (discountAmount > 0) {
        chargeParameter.item_details.push({
          id: 'PROMO',
          name: `Diskon Kupon ${appliedCoupon?.code || code}`.substring(0, 50),
          price: -discountAmount,
          quantity: 1,
        });
      }
    }

    // Susun parameter sesuai Core API Midtrans (QRIS dengan batas waktu 30 menit)
    if (isQris) {
      chargeParameter.payment_type = 'qris';
      chargeParameter.qris = { acquirer: 'gopay' };
      chargeParameter.custom_expiry = {
        expiry_duration: 30,
        unit: 'minute',
      };
    } else {
      // Bank Transfer VA (hanya untuk tiket atau modul lain yang relevan)
      if (bankName === 'mandiri' || bankName === 'echannel') {
        chargeParameter.payment_type = 'echannel';
        chargeParameter.echannel = {
          bill_info1: 'Pembayaran RBR',
          bill_info2: 'Rumah Budaya Ratna',
        };
      } else if (bankName === 'permata') {
        chargeParameter.payment_type = 'permata';
      } else {
        // Default bca / bni / bri
        chargeParameter.payment_type = 'bank_transfer';
        chargeParameter.bank_transfer = { bank: bankName };
      }
    }

    console.log(`[CoreApi Charge] Mengirim tagihan ${chargeParameter.payment_type} untuk order ${cleanOrderId}...`);
    const chargeResponse = await coreApi.charge(chargeParameter);

    // Ekstraksi data mentah dari respons Midtrans
    let extractedVaNumber = null;
    let extractedBillKey = null;
    let extractedBillerCode = null;
    let extractedQrString = chargeResponse.qr_string || null;
    let extractedQrUrl = null;

    if (chargeResponse.va_numbers && chargeResponse.va_numbers.length > 0) {
      extractedVaNumber = chargeResponse.va_numbers[0].va_number;
    } else if (chargeResponse.permata_va_number) {
      extractedVaNumber = chargeResponse.permata_va_number;
    } else if (chargeResponse.bill_key) {
      extractedBillKey = chargeResponse.bill_key;
      extractedBillerCode = chargeResponse.biller_code;
      extractedVaNumber = `${chargeResponse.biller_code} - ${chargeResponse.bill_key}`;
    }

    if (Array.isArray(chargeResponse.actions)) {
      const qrAction = chargeResponse.actions.find((a: any) => a.name === 'generate-qr-code') || chargeResponse.actions[0];
      if (qrAction) {
        extractedQrUrl = qrAction.url;
      }
    }

    // Simpan data transaksi ke tabel transactions di database MySQL
    try {
      await createTransactionModel(
        cleanOrderId,
        chargeParameter.payment_type,
        isQris ? 'qris' : `va_${bankName}`,
        finalAmount,
        'pending',
        'pending',
        extractedVaNumber || null,
        isQris ? 'qris' : bankName,
        extractedQrString || null,
        extractedQrUrl || null,
        customer_name || 'Pengunjung RBR',
        customer_email || 'customer@rumahbudayaratna.id',
        order_type || (isKedai ? 'kedai' : 'ticket'),
        chargeParameter.item_details ? JSON.stringify(chargeParameter.item_details) : (items ? JSON.stringify(items) : ''),
        expiredAt
      );
    } catch (dbErr: any) {
      console.warn('[paymentController] Simpan transactions error:', dbErr.message);
    }

    // Jika pesanan kedai, sinkronkan payment_method dan expired_at ke tabel orders
    if (isKedai) {
      try {
        const orderPaymentMethod = isQris ? 'qris' : (isCash ? 'kasir' : `va_${bankName}`);
        await pool.query(
          `UPDATE orders
           SET payment_method = ?,
               expired_at = COALESCE(expired_at, ?),
               updated_at = NOW()
           WHERE id = ? OR order_code = ?`,
          [orderPaymentMethod, expiredAt, cleanOrderId, cleanOrderId]
        );
      } catch (_) {}
    }

    // Jika transaksi adalah tiket acara, simpan ke ticket_transactions
    if (order_type === 'ticket') {
      try {
        const ticketQty = Array.isArray(items) && items.length > 0
          ? items.reduce((sum: number, it: any) => sum + Math.max(1, Number(it.quantity || it.qty || 1)), 0)
          : 1;

        await createTicketTransaction(
          event_id || 0,
          customer_name || '',
          customer_email || '',
          ticketQty,
          finalAmount,
          'Menunggu Pembayaran',
          cleanOrderId,
          isQris ? 'QRIS' : `Transfer VA ${bankName.toUpperCase()}`
        );
      } catch (ttErr: any) {
        console.warn('[paymentController] Simpan ticket_transactions error:', ttErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: isQris
        ? 'Transaksi QRIS Midtrans berhasil dibuat.'
        : 'Transaksi Midtrans Core API berhasil dibuat.',
      data: {
        order_id: cleanOrderId,
        payment_type: chargeParameter.payment_type,
        payment_method: isQris ? 'qris' : `va_${bankName}`,
        gross_amount: finalAmount,
        subtotal: amount,
        discount_amount: discountAmount,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
        transaction_status: chargeResponse.transaction_status || 'pending',
        status: 'pending',
        va_number: extractedVaNumber,
        bill_key: extractedBillKey,
        biller_code: extractedBillerCode,
        bank: bankName,
        qr_string: extractedQrString,
        qr_url: extractedQrUrl,
        actions: chargeResponse.actions || [],
        created_at: createdAt.toISOString(),
        expired_at: expiredAt.toISOString(),
        expiry_duration_seconds: 1800,
        is_expired: false,
        is_paid: false,
        raw: chargeResponse,
      },
    });
  } catch (err: any) {
    console.error('[paymentController] createCharge error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Gagal membuat tagihan Core API: ${err.message}`,
    });
  }
};

/**
 * POST /api/payment/transaction | /api/payment/create-transaction | /api/payment/snap
 * Membuat Snap Token & Redirect URL untuk pembayaran via Midtrans Snap (Sandbox).
 * Menghitung diskon kupon, menyisipkan item negatif PROMO ke item_details,
 * dan memastikan gross_amount = sum(item_details).
 */
export const createTransaction = async (req: Request, res: Response) => {
  try {
    const {
      order_id,
      gross_amount,
      customer_name,
      customer_email,
      customer_phone,
      order_type,   // 'kedai' atau 'ticket'
      event_id,
      items,
      coupon_code,
      promo_code,
      user_id,
    } = req.body;

    const code = coupon_code || promo_code || req.body.code;

    // Hitung subtotal awal dari items atau gross_amount
    let parsedItems: any[] = [];
    let subtotal = 0;

    if (Array.isArray(items) && items.length > 0) {
      parsedItems = items.map((item: any, idx: number) => {
        const itemPrice = Math.round(Number(item.price || item.harga || 0));
        const itemQty = Math.max(1, Number(item.quantity || item.qty || 1));
        subtotal += itemPrice * itemQty;
        return {
          id: String(item.id || idx + 1).substring(0, 50),
          price: itemPrice,
          quantity: itemQty,
          name: String(item.name || item.title || 'Pesanan RBR').substring(0, 50),
        };
      });
    }

    if (subtotal <= 0) {
      subtotal = Math.round(Number(gross_amount || 0));
      if (subtotal > 0 && parsedItems.length === 0) {
        parsedItems = [
          {
            id: 'ITEM-1',
            price: subtotal,
            quantity: 1,
            name: order_type === 'ticket' ? 'Tiket Acara RBR' : 'Pesanan RBR',
          },
        ];
      }
    }

    if (subtotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal transaksi wajib diisi dan harus lebih dari 0.',
      });
    }

    // Terapkan kupon promo jika diberikan
    let discountAmount = 0;
    let appliedCoupon = null;

    if (code) {
      const discountResult = await applyCouponDiscount({
        couponCode: code,
        subtotal,
        userId: user_id,
        customerEmail: customer_email,
      });

      if (!discountResult.valid) {
        return res.status(400).json({
          success: false,
          message: discountResult.message,
        });
      }

      discountAmount = discountResult.discountAmount;
      appliedCoupon = discountResult.coupon;
    }

    const finalGrossAmount = Math.max(1, subtotal - discountAmount);

    // Aturan Midtrans: sum(item_details) HARUS sama persis dengan gross_amount
    const finalItemDetails = [...parsedItems];
    if (discountAmount > 0) {
      finalItemDetails.push({
        id: 'PROMO',
        name: `Diskon Kupon ${appliedCoupon?.code || code}`.substring(0, 50),
        price: -discountAmount,
        quantity: 1,
      });
    }

    const cleanOrderId = (order_id && String(order_id).trim())
      ? String(order_id).trim().replace(/[^a-zA-Z0-9\-_]/g, '')
      : `RBR-${(order_type || 'ORD').toUpperCase()}-${Date.now()}`;

    const snapParameter: any = {
      transaction_details: {
        order_id: cleanOrderId,
        gross_amount: finalGrossAmount,
      },
      customer_details: {
        first_name: (customer_name && String(customer_name).trim()) || 'Pengunjung RBR',
        email: (customer_email && String(customer_email).trim()) || 'customer@rumahbudayaratna.id',
        phone: (customer_phone && String(customer_phone).trim()) || '081234567890',
      },
      item_details: finalItemDetails,
    };

    console.log(`[Snap createTransaction] Membuat transaksi Snap untuk order ${cleanOrderId} (gross_amount: ${finalGrossAmount})...`);
    const snapTransaction = await snap.createTransaction(snapParameter);

    // Simpan ke database MySQL
    try {
      await createTransactionModel(
        cleanOrderId,
        'snap',
        'snap',
        finalGrossAmount,
        'pending',
        'pending',
        null,
        'midtrans',
        null,
        snapTransaction.redirect_url || null,
        customer_name || 'Pengunjung RBR',
        customer_email || 'customer@rumahbudayaratna.id',
        order_type || 'kedai',
        JSON.stringify(finalItemDetails)
      );
    } catch (dbErr: any) {
      console.warn('[paymentController] Simpan transactions error:', dbErr.message);
    }

    if (order_type === 'ticket') {
      try {
        const ticketQty = parsedItems.reduce((sum: number, it: any) => sum + it.quantity, 0) || 1;
        await createTicketTransaction(
          event_id || 0,
          customer_name || '',
          customer_email || '',
          ticketQty,
          finalGrossAmount,
          'Menunggu Pembayaran',
          cleanOrderId,
          'Midtrans Snap'
        );
      } catch (ttErr: any) {
        console.warn('[paymentController] Simpan ticket_transactions error:', ttErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Transaksi Snap Midtrans berhasil dibuat.',
      data: {
        order_id: cleanOrderId,
        token: snapTransaction.token,
        snap_token: snapTransaction.token,
        redirect_url: snapTransaction.redirect_url,
        gross_amount: finalGrossAmount,
        subtotal: subtotal,
        discount_amount: discountAmount,
        coupon_code: appliedCoupon ? appliedCoupon.code : null,
      },
      token: snapTransaction.token,
      snap_token: snapTransaction.token,
      redirect_url: snapTransaction.redirect_url,
    });
  } catch (err: any) {
    console.error('[paymentController] createTransaction error:', err.message);
    return res.status(500).json({
      success: false,
      message: `Gagal membuat transaksi Snap: ${err.message}`,
    });
  }
};

/**
 * GET /api/payment/status/:orderId
 * Cek status transaksi langsung ke Midtrans API dengan try-catch aman.
 * Jika Midtrans mengembalikan error 404 ("Transaction doesn't exist"),
 * tidak melempar HTTP 500, melainkan fallback membaca status dari DB lokal
 * atau mengembalikan status 'pending'.
 */
export const checkStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID wajib diisi.',
      });
    }

    // 1. Periksa status lokal di database MySQL terlebih dahulu
    const rows = await getTransactionByOrderId(orderId);
    const tx: any = rows[0] || null;

    const now = new Date();
    const txCreatedAt = tx?.created_at ? new Date(tx.created_at) : null;
    const txExpiredAt = tx?.expired_at
      ? new Date(tx.expired_at)
      : (txCreatedAt ? new Date(txCreatedAt.getTime() + 30 * 60 * 1000) : null);

    const isPastExpiry = txExpiredAt ? now.getTime() > txExpiredAt.getTime() : false;
    let isPaid = tx ? (tx.transaction_status === 'settlement' || tx.status === 'paid') : false;
    let isExpired = false;
    let txStatus = isPaid ? 'settlement' : (tx?.transaction_status || 'pending');
    let statusResponse: any = null;

    // 2. Jika belum lunas lokal, cek status ke Midtrans API
    if (!isPaid) {
      try {
        statusResponse = await coreApi.transaction.status(orderId);
        const midtransTxStatus = statusResponse.transaction_status || 'pending';
        const fraudStatus = statusResponse.fraud_status;

        if (midtransTxStatus === 'settlement' || (midtransTxStatus === 'capture' && fraudStatus === 'accept')) {
          isPaid = true;
          txStatus = 'settlement';
        } else if (['cancel', 'deny', 'expire'].includes(midtransTxStatus)) {
          txStatus = midtransTxStatus === 'expire' ? 'expire' : 'failed';
        } else {
          txStatus = midtransTxStatus;
        }
      } catch (midtransErr: any) {
        const errMsg = midtransErr?.message || String(midtransErr);
        const is404 =
          midtransErr?.status === 404 ||
          midtransErr?.httpStatusCode === 404 ||
          /404|doesn't exist|does not exist|not found/i.test(errMsg);

        if (is404) {
          console.log(`[paymentController] Transaksi ${orderId} belum tercatat di server Midtrans. Status: pending.`);
        } else {
          console.warn(`[paymentController] Cek status Midtrans terkendala: ${errMsg}`);
        }
      }
    }

    // 3. Evaluasi kedaluwarsa 30 menit jika transaksi belum dibayar
    if (!isPaid) {
      if (isPastExpiry || txStatus === 'expire' || tx?.transaction_status === 'expire') {
        isExpired = true;
        txStatus = 'expire';

        try {
          await pool.execute(
            "UPDATE transactions SET status = 'failed', transaction_status = 'expire', updated_at = NOW() WHERE order_id = ?",
            [orderId]
          );
          await pool.execute(
            "UPDATE orders SET payment_status = 'EXPIRED', order_status = 'Batal (Kedaluwarsa)', status = 'batal', updated_at = NOW() WHERE (id = ? OR order_code = ?) AND payment_status = 'UNPAID'",
            [orderId, orderId]
          );
        } catch (dbSyncErr: any) {
          console.warn('[paymentController] Gagal update status expire:', dbSyncErr.message);
        }
      }
    }

    // 4. Jika terdeteksi lunas, sinkronkan ke database MySQL (transactions, orders, tickets)
    if (isPaid) {
      try {
        if (statusResponse) {
          await updateTransactionSettlement(statusResponse, orderId);
        } else {
          await pool.execute(
            "UPDATE transactions SET status = 'paid', transaction_status = 'settlement', updated_at = NOW() WHERE order_id = ?",
            [orderId]
          );
        }
        await updateTicketTransactionPaid(orderId);

        // Sinkronkan ke pesanan kedai agar langsung masuk antrean 'Disiapkan'
        await pool.execute(
          `UPDATE orders
           SET payment_status = 'PAID',
               order_status = 'Disiapkan',
               status = 'disiapkan',
               updated_at = NOW()
           WHERE (id = ? OR order_code = ?) AND payment_status != 'PAID'`,
          [orderId, orderId]
        );
      } catch (paidSyncErr: any) {
        console.warn('[paymentController] Gagal sinkron status paid:', paidSyncErr.message);
      }
    }

    const remainingSeconds = !isPaid && txExpiredAt && !isExpired
      ? Math.max(0, Math.floor((txExpiredAt.getTime() - now.getTime()) / 1000))
      : 0;

    return res.status(200).json({
      success: true,
      status: {
        transaction_status: txStatus,
        is_paid: isPaid,
        is_expired: isExpired,
        order_id: orderId,
        payment_type: tx ? (tx.payment_type || tx.payment_method) : null,
        gross_amount: tx ? tx.gross_amount : null,
        va_number: tx ? tx.va_number : null,
        qr_string: tx ? tx.qr_string : null,
        qr_url: tx ? tx.qr_url : null,
        created_at: txCreatedAt ? txCreatedAt.toISOString() : null,
        expired_at: txExpiredAt ? txExpiredAt.toISOString() : null,
        remaining_seconds: remainingSeconds,
        message: isExpired
          ? 'Batas waktu pembayaran (30 menit) telah kedaluwarsa.'
          : (isPaid ? 'Pembayaran berhasil dikonfirmasi.' : 'Menunggu pembayaran.'),
      },
      data: {
        order_id: orderId,
        transaction_status: txStatus,
        is_paid: isPaid,
        is_expired: isExpired,
        expired_at: txExpiredAt ? txExpiredAt.toISOString() : null,
        remaining_seconds: remainingSeconds,
        transaction: tx,
        midtrans_response: statusResponse,
      },
    });
  } catch (err: any) {
    console.error('[paymentController] checkStatus safe catch:', err.message);
    return res.status(200).json({
      success: true,
      status: {
        transaction_status: 'pending',
        is_paid: false,
        is_expired: false,
      },
    });
  }
};

/**
 * POST /api/payment/notification
 * Webhook callback dari Midtrans untuk memperbarui status pesanan menjadi 'paid' secara otomatis saat transaksi sukses.
 * Sekaligus menambah booked_count event sesuai quantity tiket yang dibeli, dan membatalkan pesanan jika kedaluwarsa.
 */
export const handleNotification = async (req: Request, res: Response) => {
  try {
    const notificationJson = req.body;
    let statusResponse: any = notificationJson;

    try {
      statusResponse = await coreApi.transaction.notification(notificationJson);
    } catch (e: any) {
      console.warn('[paymentController] coreApi notification verification fallback:', e.message);
    }

    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    let orderStatus = 'pending';
    let txStatus = transactionStatus || 'pending';

    if (transactionStatus === 'capture') {
      if (fraudStatus === 'accept') {
        orderStatus = 'paid';
        txStatus = 'settlement';
      } else {
        orderStatus = 'challenge';
        txStatus = 'challenge';
      }
    } else if (transactionStatus === 'settlement') {
      orderStatus = 'paid';
      txStatus = 'settlement';
    } else if (['cancel', 'deny', 'expire'].includes(transactionStatus)) {
      orderStatus = 'failed';
      txStatus = transactionStatus;
    }

    if (orderId) {
      await updateTransactionStatus(orderStatus, txStatus, statusResponse, orderId);

      // Sinkronkan status pesanan kedai
      if (orderStatus === 'paid') {
        try {
          await pool.execute(
            `UPDATE orders
             SET payment_status = 'PAID',
                 order_status = 'Disiapkan',
                 status = 'disiapkan',
                 updated_at = NOW()
             WHERE (id = ? OR order_code = ?) AND payment_status != 'PAID'`,
            [orderId, orderId]
          );
        } catch (_) {}
      } else if (transactionStatus === 'expire' || ['cancel', 'deny'].includes(transactionStatus)) {
        try {
          await pool.execute(
            `UPDATE orders
             SET payment_status = 'EXPIRED',
                 order_status = 'Batal (Kedaluwarsa)',
                 status = 'batal',
                 updated_at = NOW()
             WHERE (id = ? OR order_code = ?) AND payment_status = 'UNPAID'`,
            [orderId, orderId]
          );
        } catch (_) {}
      }

      // Sinkronkan status tiket jika merupakan transaksi tiket
      const ticketStatus =
        orderStatus === 'paid' ? 'Lunas' :
        orderStatus === 'failed' ? 'Gagal' : 'Menunggu Pembayaran';
      await updateTicketTransactionStatus(ticketStatus, orderId);

      // Jika lunas: tambah booked_count sesuai quantity tiket yang dibeli
      if (orderStatus === 'paid') {
        try {
          const ttRows = await getTicketTransactionByOrderId(orderId);
          if (ttRows.length > 0 && ttRows[0].event_id) {
            const eventId = ttRows[0].event_id;
            const qty = Math.max(1, Number(ttRows[0].quantity) || 1);

            const conn = await pool.getConnection();
            try {
              await conn.beginTransaction();
              const [evRows]: any = await conn.execute(
                'SELECT quota, booked_count, sold FROM events WHERE id = ? FOR UPDATE',
                [eventId]
              );
              if (evRows && evRows.length > 0) {
                const quota = Number(evRows[0].quota) || 0;
                const newBooked = Number(evRows[0].booked_count ?? evRows[0].sold ?? 0) + qty;
                const newStatus = quota > 0 && newBooked >= quota ? 'Tiket Penuh' : 'Tiket Tersedia';
                await conn.execute(
                  'UPDATE events SET booked_count = ?, sold = ?, status = ? WHERE id = ?',
                  [newBooked, newBooked, newStatus, eventId]
                );
                console.log(`[handleNotification] Event #${eventId}: booked_count -> ${newBooked}, status -> ${newStatus}`);
              }
              await conn.commit();
            } catch (evErr: any) {
              await conn.rollback();
              console.error('[handleNotification] Update booked_count gagal:', evErr.message);
            } finally {
              conn.release();
            }
          }
        } catch (ttErr: any) {
          console.error('[handleNotification] Ambil ticket_transaction gagal:', ttErr.message);
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      message: `Notification for order ${orderId} processed: ${orderStatus}`,
    });
  } catch (err: any) {
    console.error('[paymentController] handleNotification error:', err.message);
    return res.status(200).json({ status: 'ok', message: err.message });
  }
};
