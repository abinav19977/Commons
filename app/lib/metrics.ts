import { getRawDb } from "../../db";

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
  ]);
  const row = (index: number) =>
    (results[index].results?.[0] || {}) as Record<string, number>;
  return {
    customers: Number(row(0).value || 0),
    products: Number(row(1).value || 0),
    employees: Number(row(2).value || 0),
    invoices: Number(row(3).value || 0),
    revenuePaise: Number(row(3).revenue || 0),
    lowStock: Number(row(4).value || 0),
    overdueReceivables: Number(row(5).value || 0),
    overduePaise: Number(row(5).overdue || 0),
    pendingPayroll: Number(row(6).value || 0),
    pendingPayrollPaise: Number(row(6).pending || 0),
    bankReview: Number(row(7).value || 0),
  };
}
