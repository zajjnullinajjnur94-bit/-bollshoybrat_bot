function nowIso() {
  return new Date().toISOString();
}

export type ProductCode = "smart_money" | "mentoring" | "community";
export type PaymentStatus = "awaiting_receipt" | "pending_review" | "approved" | "rejected" | "cancelled";
export type ReceiptType = "photo" | "document";

export type PaymentRequestRow = {
  id: number;
  telegram_id: number;
  username: string | null;
  product: ProductCode;
  amount_rub: string;
  amount_usdt: string;
  status: PaymentStatus;
  receipt_file_id: string | null;
  receipt_type: ReceiptType | null;
  receipt_message_id: number | null;
  admin_decision_by: number | null;
  admin_decision_at: string | null;
  created_at: string;
  updated_at: string;
};

export function createPaymentsRepo(db: any) {
  const createStmt = db.prepare(
    `INSERT INTO payment_requests
      (telegram_id, username, product, amount_rub, amount_usdt, status, created_at, updated_at)
     VALUES (@telegram_id, @username, @product, @amount_rub, @amount_usdt, @status, @created_at, @updated_at)`
  );

  const getStmt = db.prepare(
    `SELECT
      id, telegram_id, username, product, amount_rub, amount_usdt, status,
      receipt_file_id, receipt_type, receipt_message_id, admin_decision_by, admin_decision_at,
      created_at, updated_at
     FROM payment_requests
     WHERE id = ?`
  );

  const setReceiptStmt = db.prepare(
    `UPDATE payment_requests
     SET status = 'pending_review',
         receipt_file_id = @receipt_file_id,
         receipt_type = @receipt_type,
         receipt_message_id = @receipt_message_id,
         updated_at = @updated_at
     WHERE id = @id`
  );

  const setStatusStmt = db.prepare(
    `UPDATE payment_requests
     SET status = @status,
         admin_decision_by = @admin_decision_by,
         admin_decision_at = @admin_decision_at,
         updated_at = @updated_at
     WHERE id = @id`
  );

  return {
    create(args: {
      telegramId: number;
      username: string | null;
      product: ProductCode;
      amountRub: string;
      amountUsdt: string;
    }) {
      const ts = nowIso();
      const res = createStmt.run({
        telegram_id: args.telegramId,
        username: args.username,
        product: args.product,
        amount_rub: args.amountRub,
        amount_usdt: args.amountUsdt,
        status: "awaiting_receipt" satisfies PaymentStatus,
        created_at: ts,
        updated_at: ts,
      });
      const id = Number(res.lastInsertRowid);
      return this.get(id);
    },

    get(id: number) {
      return getStmt.get(id) as PaymentRequestRow | undefined;
    },

    attachReceipt(args: { id: number; receiptFileId: string; receiptType: ReceiptType; receiptMessageId: number }) {
      setReceiptStmt.run({
        id: args.id,
        receipt_file_id: args.receiptFileId,
        receipt_type: args.receiptType,
        receipt_message_id: args.receiptMessageId,
        updated_at: nowIso(),
      });
      return this.get(args.id);
    },

    decide(args: { id: number; status: "approved" | "rejected" | "cancelled"; adminId: number }) {
      const ts = nowIso();
      setStatusStmt.run({
        id: args.id,
        status: args.status,
        admin_decision_by: args.adminId,
        admin_decision_at: ts,
        updated_at: ts,
      });
      return this.get(args.id);
    },
  };
}

