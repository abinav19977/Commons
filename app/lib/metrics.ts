import { getRawDb } from "../../db";
import { todayIST } from "./date";
import { getReceivableReminders, getReceivableSettings } from "../receivables/receivables-data";

function fiscalStart(today: string) {
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  return `${month >= 4 ? year : year - 1}-04-01`;
}

export type BusinessMetrics = {
  customers: number;
  products: number;
  employees: number;
  invoices: number;
  revenuePaise: number;
  lowStock: number;
  overdueReceivables: number;
  overduePaise: number;
  pendingPayroll: number;
  pendingPayrollPaise: number;
  bankReview: number;
};

export async function getBusinessMetrics(
  ownerUserId: string,
): Promise<BusinessMetrics> {
  const db = getRawDb();
  const today = todayIST();
  const from = fiscalStart(today);
  const results = await db.batch([
    db
      .prepare(
        "SELECT COUNT(*) AS value FROM customers WHERE owner_user_id = ?",
      )
      .bind(ownerUserId),
    db
      .prepare("SELECT COUNT(*) AS value FROM products WHERE owner_user_id = ?")
      .bind(ownerUserId),
    db
      .prepare(
        "SELECT COUNT(*) AS value FROM employees WHERE owner_user_id = ? AND status = 'active'",
      )
      .bind(ownerUserId),
    db
      .prepare(
        "SELECT COUNT(*) AS value, COALESCE(SUM(total_paise), 0) AS revenue FROM invoices WHERE owner_user_id = ?",
      )
      .bind(ownerUserId),
    db
      .prepare(
        "SELECT COUNT(*) AS value FROM products p WHERE p.owner_user_id = ? AND p.item_type != 'service' AND (p.opening_stock_milli + COALESCE((SELECT SUM(sm.quantity_milli) FROM stock_movements sm WHERE sm.owner_user_id = p.owner_user_id AND sm.product_id = p.id), 0)) <= p.reorder_level_milli",
      )
      .bind(ownerUserId),
    db
      .prepare(
        "SELECT COUNT(*) AS value,COALESCE(SUM(outstanding),0) AS overdue FROM (SELECT COALESCE(i.customer_id,i.customer_name) AS customer_key,SUM(i.total_paise - i.paid_paise) AS outstanding FROM invoices i WHERE i.owner_user_id = ? AND i.status NOT IN ('paid','cancelled') AND i.due_date IS NOT NULL AND i.due_date <= date('now','-' || COALESCE((SELECT overdue_days FROM receivable_settings WHERE owner_user_id = ?),7) || ' days') GROUP BY COALESCE(i.customer_id,i.customer_name) HAVING SUM(i.total_paise - i.paid_paise) >= COALESCE((SELECT minimum_outstanding_paise FROM receivable_settings WHERE owner_user_id = ?),500000))",
      )
      .bind(ownerUserId, ownerUserId, ownerUserId),
    db
      .prepare(
        "SELECT COUNT(*) AS value,COALESCE(SUM(net_pay_paise),0) AS pending FROM payroll_entries WHERE owner_user_id = ? AND status = 'pending'",
      )
      .bind(ownerUserId),
    db
      .prepare(
        "SELECT COUNT(*) AS value FROM bank_transactions WHERE owner_user_id = ? AND status = 'review'",
      )
      .bind(ownerUserId),
    // Books-truth revenue for the current fiscal year to date, so this figure always
    // agrees with /accounts/reports instead of being a separate raw invoice sum.
    db
      .prepare(
        "SELECT COALESCE(SUM(jl.credit_paise - jl.debit_paise), 0) AS revenue FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id AND je.owner_user_id = jl.owner_user_id LEFT JOIN ledger_accounts la ON la.owner_user_id = jl.owner_user_id AND la.code = jl.account_code WHERE jl.owner_user_id = ? AND je.status = 'posted' AND je.source_type != 'year_end_close' AND je.entry_date BETWEEN ? AND ? AND COALESCE(la.category, CASE WHEN jl.account_code IN ('4000','4010','4090') THEN 'income' END) = 'income'",
      )
      .bind(ownerUserId, from, today),
  ]);
  const row = (index: number) =>
    (results[index].results?.[0] || {}) as Record<string, number>;
  // Overdue receivables use the same net-of-receipts figures as the Receivables page, so the two
  // never disagree (unpaid bills alone overstate what is owed when receipts were entered on account).
  const reminders = await getReceivableReminders(ownerUserId, await getReceivableSettings(ownerUserId)).catch(() => null);
  return {
    customers: Number(row(0).value || 0),
    products: Number(row(1).value || 0),
    employees: Number(row(2).value || 0),
    invoices: Number(row(3).value || 0),
    revenuePaise: Number(row(8).revenue || 0),
    lowStock: Number(row(4).value || 0),
    overdueReceivables: reminders ? reminders.length : Number(row(5).value || 0),
    overduePaise: reminders ? reminders.reduce((sum, r) => sum + r.outstandingPaise, 0) : Number(row(5).overdue || 0),
    pendingPayroll: Number(row(6).value || 0),
    pendingPayrollPaise: Number(row(6).pending || 0),
    bankReview: Number(row(7).value || 0),
  };
}
