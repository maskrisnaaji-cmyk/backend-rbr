import pool from '../config/db';

export interface Transaction {
  id?: number;
  order_id?: string | null;
  order_type?: string;
  payment_type?: string | null;
  payment_method?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  gross_amount: number;
  status: string;
  transaction_status?: string | null;
  va_number?: string | null;
  bank?: string | null;
  qr_string?: string | null;
  qr_url?: string | null;
  payment_response?: string | null;
  items_json?: string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
  expired_at?: Date | string | null;
}

export interface TicketTransaction {
  id?: number;
  event_id?: number | null;
  tier_id?: number | null;
  tier_name?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  quantity?: number;
  amount: number;
  status: string;
  payment_proof?: string | null;
  order_id?: string | null;
  snap_token?: string | null;
  redirect_url?: string | null;
  payment_method?: string | null;
  created_at?: Date | string;
}

export interface AuditLog {
  id?: number;
  action_performed: string;
  endpoint_target?: string | null;
  performed_by?: string | null;
  ip_address?: string | null;
  meta_info?: string | null;
  created_at?: Date | string;
}

export interface AiInsight {
  id?: number;
  user_id?: number | null;
  module_type: string;
  input_query?: string | null;
  ai_response_json?: string | null;
  created_at?: Date | string;
}

export const createTransaction = async (
  orderId: string,
  paymentType: string,
  paymentMethod: string,
  grossAmount: number,
  status: string,
  txStatus: string,
  vaNumber: string | null,
  bank: string | null,
  qrString: string | null,
  qrUrl: string | null,
  customerName: string | null,
  customerEmail: string | null,
  orderType: string,
  itemsJson: string,
  expiredAt: Date | string | null = null
) => {
  try {
    const [result] = await pool.execute(
      `INSERT INTO transactions 
        (order_id, payment_type, payment_method, gross_amount, status, transaction_status, va_number, bank, qr_string, qr_url, customer_name, customer_email, order_type, items_json, expired_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        paymentType,
        paymentMethod,
        grossAmount,
        status,
        txStatus,
        vaNumber,
        bank,
        qrString,
        qrUrl,
        customerName,
        customerEmail,
        orderType,
        itemsJson,
        expiredAt,
      ]
    );
    return result as any;
  } catch (err: any) {
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.message?.includes('Unknown column')) {
      const [result] = await pool.execute(
        `INSERT INTO transactions 
          (order_id, payment_type, payment_method, gross_amount, status, transaction_status, va_number, bank, qr_string, qr_url, customer_name, customer_email, order_type, items_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          paymentType,
          paymentMethod,
          grossAmount,
          status,
          txStatus,
          vaNumber,
          bank,
          qrString,
          qrUrl,
          customerName,
          customerEmail,
          orderType,
          itemsJson,
        ]
      );
      return result as any;
    }
    throw err;
  }
};

export const createTicketTransaction = async (
  eventId: number | string,
  customerName: string,
  customerEmail: string,
  quantity: number,
  amount: number,
  status: string,
  orderId: string,
  paymentMethod: string,
  tierId?: number | null,
  tierName?: string | null
) => {
  const [result] = await pool.execute(
    `INSERT INTO ticket_transactions
      (event_id, customer_name, customer_email, quantity, amount, status, order_id, payment_method, tier_id, tier_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      customerName,
      customerEmail,
      quantity,
      amount,
      status,
      orderId,
      paymentMethod,
      tierId || null,
      tierName || null,
    ]
  );
  return result as any;
};

export const updateTransactionSettlement = async (statusResponse: any, orderId: any) => {
  const [result] = await pool.execute(
    `UPDATE transactions SET status = 'paid', transaction_status = 'settlement', payment_response = ?, updated_at = NOW() WHERE order_id = ?`,
    [JSON.stringify(statusResponse), orderId]
  );
  return result as any;
};

export const updateTicketTransactionPaid = async (orderId: any) => {
  const [result] = await pool.execute(
    `UPDATE ticket_transactions SET status = 'Lunas' WHERE order_id = ?`,
    [orderId]
  );
  return result as any;
};

export const getTransactionByOrderId = async (orderId: any) => {
  const [rows] = await pool.execute(
    'SELECT * FROM transactions WHERE order_id = ? LIMIT 1',
    [orderId]
  );
  return rows as Transaction[];
};

export const updateTransactionStatus = async (
  orderStatus: string,
  txStatus: string,
  statusResponse: any,
  orderId: any
) => {
  const [result] = await pool.execute(
    `UPDATE transactions SET status = ?, transaction_status = ?, payment_response = ?, updated_at = NOW() WHERE order_id = ?`,
    [orderStatus, txStatus, JSON.stringify(statusResponse), orderId]
  );
  return result as any;
};

export const updateTicketTransactionStatus = async (ticketStatus: string, orderId: any) => {
  const [result] = await pool.execute(
    `UPDATE ticket_transactions SET status = ? WHERE order_id = ?`,
    [ticketStatus, orderId]
  );
  return result as any;
};

export const getTicketTransactionByOrderId = async (orderId: any) => {
  const [rows] = await pool.execute(
    'SELECT id, event_id, quantity, tier_id, tier_name, status, amount, customer_email, customer_name FROM ticket_transactions WHERE order_id = ? LIMIT 1',
    [orderId]
  );
  return rows as TicketTransaction[];
};

export const updateTicketTransactionProof = async (url: string, entityId: number | string) => {
  const [result] = await pool.execute(
    'UPDATE ticket_transactions SET payment_proof = ? WHERE id = ?',
    [url, entityId]
  );
  return result as any;
};

export const createAuditLog = async (
  actionPerformed: string,
  endpointTarget: string | null = null,
  performedBy: string | null = null,
  metaInfo: string | null = null
) => {
  const [result] = await pool.execute(
    'INSERT INTO audit_logs (action_performed, endpoint_target, performed_by, meta_info) VALUES (?, ?, ?, ?)',
    [actionPerformed, endpointTarget, performedBy, metaInfo]
  );
  return result as any;
};

export const createAiInsight = async (
  userId: number | string | null,
  moduleType: string,
  inputQuery: string,
  aiResponseJson: string
) => {
  const [result] = await pool.execute(
    `INSERT INTO ai_insights (user_id, module_type, input_query, ai_response_json)
     VALUES (?, ?, ?, ?)`,
    [userId, moduleType, inputQuery, aiResponseJson]
  );
  return result as any;
};
