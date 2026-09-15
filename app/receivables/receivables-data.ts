import { getRawDb } from "../../db";

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
  const today = new Date();
  const cutoff = new Date(today.getTime() - settings.overdueDays * 86400000)
    .toISOString()
    .slice(0, 10);
  const [invoiceRows, logRows] = await Promise.all([
    getRawDb()
      .prepare(
        "SELECT COALESCE(i.customer_id,'') AS customer_id,COALESCE(c.nickname,i.customer_name) AS customer_name,COALESCE(c.primary_phone,'') AS primary_phone,COALESCE(c.email,'') AS email,SUM(i.total_paise - i.paid_paise) AS outstanding_paise,COUNT(i.id) AS invoice_count,MIN(i.due_date) AS oldest_due_date,GROUP_CONCAT(i.invoice_number) AS invoice_numbers FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id AND c.owner_user_id = i.owner_user_id WHERE i.owner_user_id = ? AND i.status NOT IN ('paid','cancelled') AND i.due_date IS NOT NULL AND i.due_date <= ? GROUP BY i.customer_id,COALESCE(c.nickname,i.customer_name),c.primary_phone,c.email HAVING SUM(i.total_paise - i.paid_paise) >= ? ORDER BY MIN(i.due_date) ASC",
      )
      .bind(ownerUserId, cutoff, settings.minimumOutstandingPaise)
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
  const rows: ReceivableReminder[] = (invoiceRows.results || []).map((row) => {
    const customerId = String(row.customer_id || "");
    const customerName = String(row.customer_name || "Customer");
    const oldestDueDate = String(row.oldest_due_date || cutoff);
    return {
      customerId,
      customerName,
      primaryPhone: String(row.primary_phone || ""),
      email: String(row.email || ""),
      outstandingPaise: Number(row.outstanding_paise || 0),
      invoiceCount: Number(row.invoice_count || 0),
      oldestDueDate,
      daysOverdue: Math.max(
        0,
        Math.floor(
          (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
            Date.parse(`${oldestDueDate}T00:00:00Z`)) /
            86400000,
        ),
      ),
      invoiceNumbers: String(row.invoice_numbers || "").split(",").filter(Boolean),
      lastReminderAt:
        lastReminder.get(`${customerId}:${customerName}`) || null,
    };
  });

  return rows;
}
