import app from '../index';
import pool from '../config/db';
import http from 'http';

let server: http.Server;
const TEST_PORT = 5099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runTests() {
  console.log('🚀 Memulai Pengujian Metode Pembayaran Kedai (QRIS & Kasir) & Expired 30 Menit...\n');

  await new Promise<void>((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Server test berjalan di ${BASE_URL}`);
      resolve();
    });
  });

  let allPassed = true;

  try {
    // ── TEST 1: Validasi Metode Pembayaran Kedai (Harus Tolak Transfer Bank) ──────
    console.log('👉 [TEST 1] Tolak pembayaran VA / Bank Transfer untuk transaksi Kedai:');
    const res1 = await fetch(`${BASE_URL}/api/payment/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: `RBR-KEDAI-TEST-VA-${Date.now()}`,
        gross_amount: 35000,
        payment_type: 'bank_transfer',
        bank: 'bca',
        order_type: 'kedai',
      }),
    });
    const data1 = await res1.json();
    if (res1.status === 400 && data1.success === false && data1.message?.includes('QRIS')) {
      console.log('   ✅ PASSED: Transfer Bank berhasil ditolak untuk Kedai dengan pesan 400 sesuai spesifikasi.\n');
    } else {
      console.error('   ❌ FAILED:', res1.status, data1);
      allPassed = false;
    }

    // ── TEST 2: Proses Pembayaran "Bayar di Kasir" (Cash / Tunai) ────────────────
    console.log('👉 [TEST 2] Terima pembayaran "Bayar di Kasir" untuk transaksi Kedai:');
    const cashOrderId = `RBR-KEDAI-TEST-CASH-${Date.now()}`;
    const res2 = await fetch(`${BASE_URL}/api/payment/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: cashOrderId,
        gross_amount: 50000,
        payment_type: 'cash',
        order_type: 'kedai',
        customer_name: 'Pelanggan Meja 05',
      }),
    });
    const data2 = await res2.json();
    const is30MinDiff = data2.data?.expired_at &&
      Math.abs((new Date(data2.data.expired_at).getTime() - new Date(data2.data.created_at).getTime()) - 30 * 60 * 1000) < 5000;

    if (res2.status === 200 && data2.success === true && data2.data?.payment_type === 'cash' && is30MinDiff) {
      console.log('   ✅ PASSED: Bayar di Kasir berhasil diproses dengan expired_at +30 menit:', {
        order_id: data2.data.order_id,
        payment_method: data2.data.payment_method,
        created_at: data2.data.created_at,
        expired_at: data2.data.expired_at,
      }, '\n');
    } else {
      console.error('   ❌ FAILED:', res2.status, data2);
      allPassed = false;
    }

    // ── TEST 3: Proses Pembayaran QRIS Midtrans Sandbox ─────────────────────────
    console.log('👉 [TEST 3] Terima pembayaran "QRIS" via Midtrans Sandbox untuk transaksi Kedai:');
    const qrisOrderId = `RBR-KEDAI-TEST-QRIS-${Date.now()}`;
    const res3 = await fetch(`${BASE_URL}/api/payment/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: qrisOrderId,
        gross_amount: 25000,
        payment_type: 'qris',
        order_type: 'kedai',
        customer_name: 'Pelanggan QRIS Meja 02',
      }),
    });
    const data3 = await res3.json();
    if (res3.status === 200 && data3.success === true && (data3.data?.qr_string || data3.data?.actions)) {
      console.log('   ✅ PASSED: QRIS Midtrans Sandbox berhasil dibuat:', {
        order_id: data3.data.order_id,
        payment_type: data3.data.payment_type,
        qr_string_preview: data3.data.qr_string ? data3.data.qr_string.substring(0, 30) + '...' : null,
        qr_url: data3.data.qr_url,
        expired_at: data3.data.expired_at,
      }, '\n');
    } else {
      console.error('   ❌ FAILED:', res3.status, data3);
      allPassed = false;
    }

    // ── TEST 4: Pembuatan Order Kedai & Format Waktu 30 Menit ───────────────────
    console.log('👉 [TEST 4] POST /api/kedai/orders menyimpan waktu created_at & expired_at (+30 menit):');
    const newKedaiCode = `RBR-KEDAI-ORD-${Date.now()}`;
    const res4 = await fetch(`${BASE_URL}/api/kedai/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_code: newKedaiCode,
        table_number: 'Meja 08',
        total_price: 36000,
        payment_type: 'qris',
        items: [
          { name: 'Kopi Susu Creamy', quantity: 2, price: 18000 },
        ],
      }),
    });
    const data4 = await res4.json();
    if (res4.status === 201 && data4.data?.expired_at && data4.data?.remaining_seconds > 0) {
      console.log('   ✅ PASSED: Order kedai berhasil dibuat dengan expired_at dan sisa detik:', {
        order_code: data4.data.order_code,
        payment_status: data4.data.payment_status,
        created_at: data4.data.created_at,
        expired_at: data4.data.expired_at,
        remaining_seconds: data4.data.remaining_seconds,
      }, '\n');
    } else {
      console.error('   ❌ FAILED:', res4.status, data4);
      allPassed = false;
    }

    // ── TEST 5: Penanganan Transaksi & Order Kadaluarsa (> 30 Menit) ────────────
    console.log('👉 [TEST 5] Penanganan status kadaluarsa jika melewati 30 menit:');
    const expiredOrderId = `RBR-KEDAI-EXPIRED-${Date.now()}`;
    // Insert dummy expired order & transaction (35 menit lalu)
    const pastCreated = new Date(Date.now() - 35 * 60 * 1000);
    const pastExpired = new Date(Date.now() - 5 * 60 * 1000);

    await pool.query(
      `INSERT INTO orders (id, order_code, table_number, items, total_price, payment_status, order_status, status, created_at, expired_at)
       VALUES (?, ?, 'Meja 09', '[]', 20000, 'UNPAID', 'Menunggu', 'menunggu', ?, ?)`,
      [expiredOrderId, expiredOrderId, pastCreated, pastExpired]
    );

    await pool.query(
      `INSERT INTO transactions (order_id, payment_type, payment_method, gross_amount, status, transaction_status, created_at, expired_at)
       VALUES (?, 'qris', 'qris', 20000, 'pending', 'pending', ?, ?)`,
      [expiredOrderId, pastCreated, pastExpired]
    );

    const res5 = await fetch(`${BASE_URL}/api/payment/status/${expiredOrderId}`);
    const data5 = await res5.json();

    if (res5.status === 200 && data5.status?.is_expired === true && data5.status?.transaction_status === 'expire') {
      console.log('   ✅ PASSED: Order yang melewati 30 menit otomatis ditandai expire & is_expired: true.\n');
    } else {
      console.error('   ❌ FAILED:', res5.status, data5);
      allPassed = false;
    }

    // ── TEST 6: Tiket Acara Tetap Mendukung VA ──────────────────────────────────
    console.log('👉 [TEST 6] Pastikan pesanan tiket acara tetap mendukung Transfer Bank VA:');
    const res6 = await fetch(`${BASE_URL}/api/payment/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: `RBR-TKT-TEST-${Date.now()}`,
        gross_amount: 50000,
        payment_type: 'bank_transfer',
        bank: 'bca',
        order_type: 'ticket',
        event_id: 1,
      }),
    });
    const data6 = await res6.json();
    if (res6.status === 200 && data6.success === true && data6.data?.va_number) {
      console.log('   ✅ PASSED: Transaksi tiket tetap dapat menggunakan Transfer Bank VA:', {
        order_id: data6.data.order_id,
        va_number: data6.data.va_number,
      }, '\n');
    } else {
      console.error('   ❌ FAILED:', res6.status, data6);
      allPassed = false;
    }

    console.log('═══════════════════════════════════════════════════════════');
    if (allPassed) {
      console.log('🎉 SEMUA PENGUJIAN METODE PEMBAYARAN KEDAI BERHASIL (100% PASSED)!');
    } else {
      console.log('❌ BEBERAPA PENGUJIAN GAGAL.');
    }
    console.log('═══════════════════════════════════════════════════════════');
  } finally {
    server.close();
    process.exit(allPassed ? 0 : 1);
  }
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
