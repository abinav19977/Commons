import { getRawDb } from "../../db";
import { CORE_ACCOUNTS, isBalanced, type BookLine } from "./accounting";

export async function assertPeriodOpen(ownerUserId: string, entryDate: string) {
  const row = await getRawDb()
    .prepare(
      "SELECT id FROM period_locks WHERE owner_user_id = ? AND ? BETWEEN period_start AND period_end LIMIT 1",
    )
    .bind(ownerUserId, entryDate)
    .first();
  if (row) throw new Error("PERIOD_LOCKED");
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function prepareJournal(options: {
  ownerUserId: string;
  actor: string;
  entryDate: string;
  sourceType: string;
  sourceId?: string | null;
  description: string;
  lines: BookLine[];
}) {
  if (!isBalanced(options.lines)) throw new Error("UNBALANCED_ENTRY");
  const date=new Date(options.entryDate+"T00:00:00Z");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(options.entryDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==options.entryDate)throw new Error("INVALID_ENTRY_DATE");
  await assertPeriodOpen(options.ownerUserId,options.entryDate);
  const raw = getRawDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const voucherPrefixes: Record<string, string> = {
    money_in: "RCPT",
    bank_receipt: "RCPT",
    invoice_receipt: "RCPT",
    money_out: "PMT",
    transfer: "CONTRA",
    adjustment: "JV",
    sales_invoice: "SALE",
    purchase: "PUR",
    payroll: "PAY",
    advance: "ADV",
    advance_application: "ADJ",
    restock: "STK",
    production: "MFG",
    opening_balance: "OPEN",
    sales_return: "SR",
    purchase_return: "PR",
    credit_note: "CN",
    debit_note: "DN",
  };
  const prefix = voucherPrefixes[options.sourceType] || "JV";
  const number = `${prefix}-${options.entryDate.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const previous = await raw
    .prepare("SELECT event_hash FROM audit_events WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(options.ownerUserId)
    .first<{ event_hash: string }>();
  const eventId = crypto.randomUUID();
  const hash = await sha256(
    [
      previous?.event_hash || "GENESIS",
      eventId,
      options.ownerUserId,
      options.sourceType,
      options.sourceId || id,
      options.entryDate,
      now,
      options.description,
      JSON.stringify(options.lines.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debitPaise: line.debitPaise,
        creditPaise: line.creditPaise,
        partyType: line.partyType || null,
        partyId: line.partyId || null,
        partyName: line.partyName || null,
      }))),
    ].join("|"),
  );
  const statements = [
    ...CORE_ACCOUNTS.map((account) =>
      raw.prepare(
        "INSERT OR IGNORE INTO ledger_accounts (id,owner_user_id,code,name,category,normal_side,system_key,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), options.ownerUserId, account.code, account.name, account.category, account.normalSide, account.systemKey, 1, now),
    ),
    raw.prepare(
      "INSERT INTO journal_entries (id,owner_user_id,entry_number,entry_date,source_type,source_id,description,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(id, options.ownerUserId, number, options.entryDate, options.sourceType, options.sourceId || null, options.description, "posted", options.actor, now),
    ...options.lines.map((line) =>
      raw.prepare(
        "INSERT INTO journal_lines (id,entry_id,owner_user_id,account_code,account_name,debit_paise,credit_paise,party_type,party_id,party_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), id, options.ownerUserId, line.accountCode, line.accountName, line.debitPaise, line.creditPaise, line.partyType || null, line.partyId || null, line.partyName || null, now),
    ),
    raw.prepare(
      "INSERT INTO audit_events (id,owner_user_id,actor,action,entity_type,entity_id,summary,previous_hash,event_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    ).bind(eventId, options.ownerUserId, options.actor, "created", "journal_entry", id, options.description, previous?.event_hash || null, hash, now),
  ];
  return { id, number, statements };
}
