import { getRawDb } from "../../db";
import { digest } from "./tally-bridge";

export const BACKUP_TABLES=["business_profiles","customers","suppliers","products","invoices","invoice_items","invoice_payments","invoice_sequences","purchases","purchase_items","purchase_payments","stock_movements","employees","ledger_accounts","gst_filing_sessions","gst_2b_entries","fixed_assets","year_end_closures","receivable_settings","reminder_logs","business_members","compliance_connections","tally_documents","tally_bill_allocations","tally_batch_effects","tally_import_receipts","tally_transfers","payment_advances","payroll_entries","bank_import_batches","bank_transactions","journal_entries","journal_lines","adjustment_documents","warehouses","inventory_batches","period_locks","audit_events"] as const;
export const BACKUP_FORMAT="commons-backup-v3";

export type BackupPayload = { format: string; dataSha256: string; data: Record<string, Record<string, unknown>[]> };

export async function buildBackup(ownerUserId: string): Promise<BackupPayload> {
  const raw = getRawDb();
  const results = await raw.batch(BACKUP_TABLES.map((table) => raw.prepare(`SELECT * FROM ${table} WHERE owner_user_id = ?`).bind(ownerUserId)));
  const data = Object.fromEntries(BACKUP_TABLES.map((table, index) => [table, results[index].results]));
  return { format: BACKUP_FORMAT, dataSha256: await digest(JSON.stringify(data)), data };
}

// Inserts backup rows for one owner. Assumes the destination tables are already
// empty for this owner (either a fresh company, or cleared by clearBackupTables first).
export async function applyBackup(ownerUserId: string, data: Record<string, Record<string, unknown>[]>): Promise<number> {
  const raw = getRawDb();
  const statements = [] as ReturnType<typeof raw.prepare>[];
  for (const table of BACKUP_TABLES) {
    if (table === "business_profiles") continue;
    for (const row of data[table] || []) {
      const columns = Object.keys(row);
      if (!columns.length || columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) throw new Error("INVALID_COLUMNS");
      const values = columns.map((column) => (column === "owner_user_id" ? ownerUserId : row[column]));
      statements.push(raw.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).bind(...values));
    }
  }
  for (let i = 0; i < statements.length; i += 100) await raw.batch(statements.slice(i, i + 100));
  return statements.length;
}

export async function clearBackupTables(ownerUserId: string): Promise<void> {
  const raw = getRawDb();
  for (const table of BACKUP_TABLES) {
    if (table === "business_profiles") continue;
    await raw.prepare(`DELETE FROM ${table} WHERE owner_user_id = ?`).bind(ownerUserId).run();
  }
}
