import { Request, Response } from 'express';
import pool from '../config/db';
import {
  createTransaction,
  createTicketTransaction,
  updateTransactionSettlement,
  updateTicketTransactionPaid,
  getTransactionByOrderId,
  updateTransactionStatus,
  updateTicketTransactionStatus,
  getTicketTransactionByOrderId,
} from '../models/transactionModel';

const midtransClient = require('midtrans-client');

// ─── Inisialisasi Midtrans Core API (Sandbox Mode) ─────────────────────────
const coreApi = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-cNRPfg50s3Xc.ZQuesNEDHdv',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-server-cNRPfg50s3Xc.ZQuesNEDHdv',
});

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
    } = req.body;

    const amount = Math.round(Number(gross_amount));
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Nominal transaksi (gross_amount) wajib diisi dan harus lebih dari 0.',
      });
    }

    const cleanOrderId = (order_id && String(order_id).trim())
      ? String(order_id).trim().replace(/[^a-zA-Z0-9\-_]/g, '')
      : `RBR-${(order_type || 'ORD').toUpperCase()}-${Date.now()}`;

    const pt = (payment_type || '').toLowerCase();
    const bankName = (bank || 'bca').toLowerCase();

    let chargeParameter: any = {
      transaction_details: {
        order_id: cleanOrderId,
        gross_amount: amount,
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
    }

    // Susun parameter sesuai Core API Midtrans
    let isQris = pt === 'qris' || pt.includes('qris');
    if (isQris) {
      chargeParameter.payment_type = 'qris';
      chargeParameter.qris = { acquirer: 'gopay' };
    } else {
      // Bank Transfer VA
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
      await createTransaction(
        cleanOrderId,
        chargeParameter.payment_type,
        isQris ? 'qris' : `va_${bankName}`,
        amount,
        'pending',
        'pending',
        extractedVaNumber || null,
        isQris ? 'qris' : bankName,
        extractedQrString || null,
        extractedQrUrl || null,
        customer_name || 'Pengunjung RBR',
        customer_email || 'customer@rumahbudayaratna.id',
        order_type || 'kedai',
        items ? JSON.stringify(items) : ''
      );
    } catch (dbErr: any) {
      console.warn('[paymentController] Simpan transactions error:', dbErr.message);
    }

    // Jika transaksi adalah tiket acara, simpan ke ticket_transactions
    if (order_type === 'ticket') {
      try {
        // Hitung total qty dari items (atau default 1)
        const ticketQty = Array.isArray(items) && items.length > 0
          ? items.reduce((sum: number, it: any) => sum + Math.max(1, Number(it.quantity || it.qty || 1)), 0)
          : 1;

        await createTicketTransaction(
          event_id || 0,
          customer_name || '',
          customer_email || '',
          ticketQty,
          amount,
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
      message: 'Transaksi Midtrans Core API berhasil dibuat.',
      data: {
        order_id: cleanOrderId,
        payment_type: chargeParameter.payment_type,
        gross_amount: amount,
        transaction_status: chargeResponse.transaction_status || 'pending',
        va_number: extractedVaNumber,
        bill_key: extractedBillKey,
        biller_code: extractedBillerCode,
        bank: bankName,
        qr_string: extractedQrString,
        qr_url: extractedQrUrl,
        actions: chargeResponse.actions || [],
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

    let statusResponse: any = null;
    let isPaid = false;
    let txStatus = 'pending';

    try {
      statusResponse = await coreApi.transaction.status(orderId);
      txStatus = statusResponse.transaction_status || 'pending';
      const fraudStatus = statusResponse.fraud_status;

      if (txStatus === 'settlement' || (txStatus === 'capture' && fraudStatus === 'accept')) {
        isPaid = true;
        txStatus = 'settlement';
      } else if (['cancel', 'deny', 'expire'].includes(txStatus)) {
        txStatus = 'failed';
      }

      // Jika terdeteksi lunas, sinkronkan ke database MySQL
      if (isPaid) {
        await updateTransactionSettlement(statusResponse, orderId);
        await updateTicketTransactionPaid(orderId);
      }
    } catch (midtransErr: any) {
      // Tangani error 404 ("Transaction doesn't exist") secara aman tanpa melempar status 500
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

    // Periksa status lokal di database MySQL
    const rows = await getTransactionByOrderId(orderId);
    const tx: any = rows[0] || null;

    if (tx && (tx.transaction_status === 'settlement' || tx.status === 'paid')) {
      isPaid = true;
      txStatus = 'settlement';
    }

    return res.status(200).json({
      success: true,
      status: {
        transaction_status: isPaid ? 'settlement' : txStatus,
        is_paid: isPaid,
        order_id: orderId,
        payment_type: tx ? (tx.payment_type || tx.payment_method) : null,
        gross_amount: tx ? tx.gross_amount : null,
        va_number: tx ? tx.va_number : null,
      },
      data: {
        order_id: orderId,
        transaction_status: isPaid ? 'settlement' : txStatus,
        is_paid: isPaid,
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
      },
    });
  }
};

/**
 * POST /api/payment/notification
 * Webhook callback dari Midtrans untuk memperbarui status pesanan menjadi 'paid' secara otomatis saat transaksi sukses.
 * Sekaligus menambah booked_count event sesuai quantity tiket yang dibeli.
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

            // Gunakan transaksi DB untuk atomic update + auto Tiket Penuh
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
