import { getRawDb } from "../../db";
import { daysAgoIST, todayIST } from "../lib/date";
import { allocateBalance } from "../lib/receivables-ledger";

export const defaultReminderTemplate =
  "Hello {customer}, this is a gentle reminder that {amount} is pending against {invoice_count} invoice(s). The oldest due date is {oldest_due_date}. Please share an update on payment. Thank you.";

export type ReceivableSettingsView = {
  overdueDays: number;
  minimumOutstandingPaise: number;
  preferredChannel: "both" | "whatsapp" | "email";
  messageTemplate: string;
  enabled: boolean;
};

export type ReceivableReminder = {
  customerId: string;
  customerName: string;
  primaryPhone: string;
  email: string;
  outstandingPaise: number;
  invoiceCount: number;
  oldestDueDate: string;
  daysOverdue: number;
  invoiceNumbers: string[];
  lastReminderAt: number | null;
};

export const defaultReceivableSettings: ReceivableSettingsView = {
  overdueDays: 7,
  minimumOutstandingPaise: 500000,
  preferredChannel: "both",
  messageTemplate: defaultReminderTemplate,
  enabled: true,
};

export async function getReceivableSettings(
  ownerUserId: string,
): Promise<ReceivableSettingsView> {
  const row = (
    await getRawDb()
      .prepare(
        "SELECT overdue_days,minimum_outstanding_paise,preferred_channel,message_template,enabled FROM receivable_settings WHERE owner_user_id = ? LIMIT 1",
      )
      .bind(ownerUserId)
      .first<Record<string, unknown>>()
  );
  if (!row) return defaultReceivableSettings;
  return {
    overdueDays: Number(row.overdue_days || 0),
    minimumOutstandingPaise: Number(row.minimum_outstanding_paise || 0),
    preferredChannel:
      row.preferred_channel === "whatsapp" || row.preferred_channel === "email"
        ? row.preferred_channel
        : "both",
    messageTemplate: String(row.message_template || defaultReminderTemplate),
    enabled: Boolean(row.enabled),
  };
}

export async function getReceivableReminders(
  ownerUserId: string,
  settings: ReceivableSettingsView,
): Promise<ReceivableReminder[]> {
  if (!settings.enabled) return [];
  const cutoff = daysAgoIST(settings.overdueDays);
  const [invoiceRows, ledgerRows, logRows] = await Promise.all([
    getRawDb()
      .prepare(
        "SELECT COALESCE(i.customer_id,'') AS customer_id,COALESCE(c.nickname,i.customer_name) AS customer_name,COALESCE(c.primary_phone,'') AS primary_phone,COALESCE(c.email,'') AS email,i.invoice_number,COALESCE(i.due_date,i.invoice_date) AS due_date,i.total_paise - i.paid_paise AS outstanding FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id AND c.owner_user_id = i.owner_user_id WHERE i.owner_user_id = ? AND i.status NOT IN ('paid','cancelled') AND i.total_paise > i.paid_paise",
      )
      .bind(ownerUserId)
      .all<Record<string, unknown>>(),
    // What each customer owes according to the books (bills less receipts, credit notes and adjustments).
    getRawDb()
      .prepare(
        "SELECT jl.party_id AS customer_id,SUM(jl.debit_paise - jl.credit_paise) AS balance FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.owner_user_id = jl.owner_user_id WHERE jl.owner_user_id = ? AND jl.account_code = '1100' AND jl.party_id IS NOT NULL AND je.status = 'posted' GROUP BY jl.party_id",
      )
      .bind(ownerUserId)
      .all<Record<string, unknown>>(),
    getRawDb()
      .prepare(
        "SELECT COALESCE(customer_id,'') AS customer_id,customer_name,MAX(created_at) AS last_reminder_at FROM reminder_logs WHERE owner_user_id = ? GROUP BY customer_id,customer_name",
      )
      .bind(ownerUserId)
      .all<Record<string, unknown>>(),
  ]);
  const lastReminder = new Map<string, number>();
  for (const row of logRows.results || [])
    lastReminder.set(
      `${String(row.customer_id || "")}:${String(row.customer_name || "")}`,
      Number(row.last_reminder_at || 0),
    );
  const ledger = new Map<string, number>();
  for (const row of ledgerRows.results || []) ledger.set(String(row.customer_id), Number(row.balance || 0));
  type Group = { customerId: string; customerName: string; primaryPhone: string; email: string; bills: { number: string; due: string; outstanding: number }[] };
  const groups = new Map<string, Group>();
  for (const row of invoiceRows.results || []) {
    const customerId = String(row.customer_id || "");
    const key = customerId || `name:${String(row.customer_name || "")}`;
    const group = groups.get(key) || { customerId, customerName: String(row.customer_name || "Customer"), primaryPhone: String(row.primary_phone || ""), email: String(row.email || ""), bills: [] };
    group.bills.push({ number: String(row.invoice_number), due: String(row.due_date), outstanding: Number(row.outstanding || 0) });
    groups.set(key, group);
  }
  const rows: ReceivableReminder[] = [];
  for (const group of groups.values()) {
    // Net the bills against the ledger when the books track this customer; otherwise fall back to the bills.
    const balance = group.customerId && ledger.has(group.customerId) ? ledger.get(group.customerId)! : null;
    const net = balance === null ? { remaining: group.bills, unattributed: 0 } : allocateBalance(balance, group.bills);
    const overdue = net.remaining.filter((bill) => bill.due <= cutoff);
    const outstanding = overdue.reduce((sum, bill) => sum + bill.outstanding, 0);
    if (!overdue.length || outstanding < settings.minimumOutstandingPaise) continue;
    const oldestDueDate = overdue.map((bill) => bill.due).sort()[0];
    rows.push({
      customerId: group.customerId,
      customerName: group.customerName,
      primaryPhone: group.primaryPhone,
      email: group.email,
      outstandingPaise: outstanding,
      invoiceCount: overdue.length,
      oldestDueDate,
      daysOverdue: Math.max(0, Math.floor((Date.parse(`${todayIST()}T00:00:00Z`) - Date.parse(`${oldestDueDate}T00:00:00Z`)) / 86400000)),
      invoiceNumbers: overdue.map((bill) => bill.number),
      lastReminderAt: lastReminder.get(`${group.customerId}:${group.customerName}`) || null,
    });
  }
  rows.sort((a, b) => (a.oldestDueDate < b.oldestDueDate ? -1 : 1));

  return rows;
}
