import { getRawDb } from "../../db";

export type BankTransactionView = {
  id: string;
  transactionDate: string;
  direction: string;
  amountPaise: number;
  description: string | null;
  reference: string | null;
  counterpartyAccountLast4: string | null;
  matchedEntityName: string | null;
  matchConfidence: string | null;
  matchReason: string | null;
  status: string;
};

export type BankBatchView = {
  id: string;
  sourceFilename: string;
  statementAccountLast4: string | null;
  importedCount: number;
  matchedCount: number;
  reviewCount: number;
  unmatchedCount: number;
  createdAt: number;
};

export const demoBankTransactions: BankTransactionView[] = [];

export async function getBankingData(ownerUserId: string) {
  const raw = getRawDb();
  const [transactions, batches] = await Promise.all([
    raw
      .prepare(
        "SELECT id,transaction_date,direction,amount_paise,description,reference,counterparty_account_last4,matched_entity_name,match_confidence,match_reason,status FROM bank_transactions WHERE owner_user_id = ? ORDER BY transaction_date DESC,created_at DESC LIMIT 100",
      )
      .bind(ownerUserId)
      .all<Record<string, unknown>>(),
    raw
      .prepare(
        "SELECT id,source_filename,statement_account_last4,imported_count,matched_count,review_count,unmatched_count,created_at FROM bank_import_batches WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 8",
      )
      .bind(ownerUserId)
      .all<Record<string, unknown>>(),
  ]);
  return {
    transactions: (transactions.results || []).map((row) => ({
      id: String(row.id),
      transactionDate: String(row.transaction_date),
      direction: String(row.direction),
      amountPaise: Number(row.amount_paise || 0),
      description: row.description ? String(row.description) : null,
      reference: row.reference ? String(row.reference) : null,
      counterpartyAccountLast4: row.counterparty_account_last4 ? String(row.counterparty_account_last4) : null,
      matchedEntityName: row.matched_entity_name ? String(row.matched_entity_name) : null,
      matchConfidence: row.match_confidence ? String(row.match_confidence) : null,
      matchReason: row.match_reason ? String(row.match_reason) : null,
      status: String(row.status || "unmatched"),
    })) as BankTransactionView[],
    batches: (batches.results || []).map((row) => ({
      id: String(row.id),
      sourceFilename: String(row.source_filename),
      statementAccountLast4: row.statement_account_last4 ? String(row.statement_account_last4) : null,
      importedCount: Number(row.imported_count || 0),
      matchedCount: Number(row.matched_count || 0),
      reviewCount: Number(row.review_count || 0),
      unmatchedCount: Number(row.unmatched_count || 0),
      createdAt: Number(row.created_at || 0),
    })) as BankBatchView[],
  };
}
