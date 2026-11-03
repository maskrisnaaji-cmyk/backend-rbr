'use strict';

/**
 * paymentController.js — Integrasi Midtrans Core API (Charge API)
 * Rumah Budaya Ratna (Kedai Kopi & Tiket Agenda)
 */

const midtransClient = require('midtrans-client');
const pool = require('../config/db');

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
const createCharge = async (req, res) => {
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

    let chargeParameter = {
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
      chargeParameter.item_details = items.map((item, idx) => ({
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
      const qrAction = chargeResponse.actions.find(a => a.name === 'generate-qr-code') || chargeResponse.actions[0];
      if (qrAction) {
        extractedQrUrl = qrAction.url;
      }
    }

    // Simpan data transaksi ke tabel transactions di database MySQL
    try {
      await pool.execute(
        `INSERT INTO transactions 
          (order_id, payment_type, payment_method, gross_amount, status, transaction_status, va_number, bank, qr_string, qr_url, customer_name, customer_email, order_type, items_json)
         VALUES (?, ?, ?, ?, 'pending', 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanOrderId,
          chargeParameter.payment_type,
          isQris ? 'qris' : `va_${bankName}`,
          amount,
          extractedVaNumber || null,
          isQris ? 'qris' : bankName,
          extractedQrString || null,
          extractedQrUrl || null,
          customer_name || 'Pengunjung RBR',
          customer_email || 'customer@rumahbudayaratna.id',
          order_type || 'kedai',
          items ? JSON.stringify(items) : null,
        ]
      );
    } catch (dbErr) {
      console.warn('[paymentController] Simpan transactions error:', dbErr.message);
    }

    // Jika transaksi adalah tiket acara, simpan ke ticket_transactions
    if (order_type === 'ticket') {
      try {
        await pool.execute(
          `INSERT INTO ticket_transactions 
            (event_id, customer_name, customer_email, amount, status, order_id, payment_method)
           VALUES (?, ?, ?, ?, 'Menunggu Pembayaran', ?, ?)`,
          [
            event_id || null,
            customer_name || 'Pengunjung RBR',
            customer_email || 'customer@rumahbudayaratna.id',
            amount,
            cleanOrderId,
            isQris ? 'qris' : `va_${bankName}`,
          ]
        );
      } catch (ttErr) {
        console.warn('[paymentController] Simpan ticket_transactions error:', ttErr.message);
      }
    }

    // Catat ke audit log
    await pool.execute(
      `INSERT INTO audit_logs (action_performed, endpoint_target) VALUES (?, ?)`,
      ['MIDTRANS_COREAPI_CHARGE', '/api/payment/charge']
    ).catch(() => {});

    // Kembalikan data mentah lengkap ke frontend Flutter
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
  } catch (err) {
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
 * kembalikan JSON { success: true, status: { transaction_status: 'pending' } }.
 */
const checkStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID wajib diisi.',
      });
    }

    let statusResponse = null;
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
        await pool.execute(
          `UPDATE transactions SET status = 'paid', transaction_status = 'settlement', payment_response = ?, updated_at = NOW() WHERE order_id = ?`,
          [JSON.stringify(statusResponse), orderId]
        );
        await pool.execute(
          `UPDATE ticket_transactions SET status = 'Lunas' WHERE order_id = ?`,
          [orderId]
        );
      }
    } catch (midtransErr) {
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
    const [rows] = await pool.execute(
      'SELECT * FROM transactions WHERE order_id = ? LIMIT 1',
      [orderId]
    );
    const tx = rows[0] || null;

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
  } catch (err) {
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
 */
const handleNotification = async (req, res) => {
  try {
    const notificationJson = req.body;
    let statusResponse = notificationJson;

    try {
      statusResponse = await coreApi.transaction.notification(notificationJson);
    } catch (e) {
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
      await pool.execute(
        `UPDATE transactions SET status = ?, transaction_status = ?, payment_response = ?, updated_at = NOW() WHERE order_id = ?`,
        [orderStatus, txStatus, JSON.stringify(statusResponse), orderId]
      );

      const ticketStatus = orderStatus === 'paid' ? 'Lunas' : (orderStatus === 'failed' ? 'Gagal' : 'Menunggu Pembayaran');
      await pool.execute(
        `UPDATE ticket_transactions SET status = ? WHERE order_id = ?`,
        [ticketStatus, orderId]
      );

      if (orderStatus === 'paid') {
        try {
          const [ttRows] = await pool.execute('SELECT event_id FROM ticket_transactions WHERE order_id = ?', [orderId]);
          if (ttRows.length > 0 && ttRows[0].event_id) {
            await pool.execute('UPDATE events SET sold = sold + 1 WHERE id = ?', [ttRows[0].event_id]);
          }
        } catch (_) {}
      }
    }

    return res.status(200).json({
      status: 'success',
      message: `Notification for order ${orderId} processed: ${orderStatus}`,
    });
  } catch (err) {
    console.error('[paymentController] handleNotification error:', err.message);
    return res.status(200).json({ status: 'ok', message: err.message });
  }
};

module.exports = {
  createCharge,
  handleNotification,
  checkStatus,
};
