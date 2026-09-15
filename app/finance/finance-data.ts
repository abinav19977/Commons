import { getRawDb } from "../../db";

export type AdvanceView = {
  id: string;
  advanceType: "customer_received" | "supplier_paid" | "employee_paid";
  partyId: string | null;
  partyName: string;
  advanceDate: string;
  amountPaise: number;
  appliedPaise: number;
  paymentMode: string;
  reference: string | null;
  purpose: string | null;
  status: string;
};

export type PayrollView = {
  id: string;
  employeeKey: string;
  employeeName: string;
  salaryMonth: string;
  baseSalaryPaise: number;
  bonusPaise: number;
  advanceDeductionPaise: number;
  otherDeductionPaise: number;
  netPayPaise: number;
  paymentDate: string | null;
  paymentMode: string | null;
  reference: string | null;
  status: string;
};

export const demoAdvances: AdvanceView[] = [];

export const demoPayroll: PayrollView[] = [];

export async function listAdvances(ownerUserId: string): Promise<AdvanceView[]> {
  const rows = await getRawDb()
    .prepare(
      "SELECT id,advance_type,party_id,party_name,advance_date,amount_paise,applied_paise,payment_mode,reference,purpose,status FROM payment_advances WHERE owner_user_id = ? ORDER BY advance_date DESC,created_at DESC LIMIT 100",
    )
    .bind(ownerUserId)
    .all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({
    id: String(row.id),
    advanceType: row.advance_type as AdvanceView["advanceType"],
    partyId: row.party_id ? String(row.party_id) : null,
    partyName: String(row.party_name),
    advanceDate: String(row.advance_date),
    amountPaise: Number(row.amount_paise || 0),
    appliedPaise: Number(row.applied_paise || 0),
    paymentMode: String(row.payment_mode || "bank_transfer"),
    reference: row.reference ? String(row.reference) : null,
    purpose: row.purpose ? String(row.purpose) : null,
    status: String(row.status || "active"),
  }));
}

export async function listPayroll(ownerUserId: string): Promise<PayrollView[]> {
  const rows = await getRawDb()
    .prepare(
      "SELECT id,employee_key,employee_name,salary_month,base_salary_paise,bonus_paise,advance_deduction_paise,other_deduction_paise,net_pay_paise,payment_date,payment_mode,reference,status FROM payroll_entries WHERE owner_user_id = ? ORDER BY salary_month DESC,employee_name ASC LIMIT 120",
    )
    .bind(ownerUserId)
    .all<Record<string, unknown>>();
  return (rows.results || []).map((row) => ({
    id: String(row.id),
    employeeKey: String(row.employee_key),
    employeeName: String(row.employee_name),
    salaryMonth: String(row.salary_month),
    baseSalaryPaise: Number(row.base_salary_paise || 0),
    bonusPaise: Number(row.bonus_paise || 0),
    advanceDeductionPaise: Number(row.advance_deduction_paise || 0),
    otherDeductionPaise: Number(row.other_deduction_paise || 0),
    netPayPaise: Number(row.net_pay_paise || 0),
    paymentDate: row.payment_date ? String(row.payment_date) : null,
    paymentMode: row.payment_mode ? String(row.payment_mode) : null,
    reference: row.reference ? String(row.reference) : null,
    status: String(row.status || "pending"),
  }));
}
