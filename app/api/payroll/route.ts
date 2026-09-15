import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../db";
import { getChatGPTUser } from "../../company-auth";
import { payrollEntry } from "../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../lib/book-server";

const schema = z.object({
  employeeKey: z.string().trim().min(1).max(100),
  employeeName: z.string().trim().min(1).max(160),
  salaryMonth: z.string().regex(/^\d{4}-\d{2}$/),
  baseSalary: z.number().min(0).max(1000000000),
  bonus: z.number().min(0).max(1000000000).default(0),
  advanceDeduction: z.number().min(0).max(1000000000).default(0),
  otherDeduction: z.number().min(0).max(1000000000).default(0),
  paymentDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  paymentMode: z.enum(["bank_transfer", "upi", "cash", "cheque", "other", ""]),
  reference: z.string().trim().max(100).optional().default(""),
  status: z.enum(["pending", "paid", "on_hold"]),
  notes: z.string().trim().max(500).optional().default(""),
});

const blank = (value: string) => value || null;

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check the salary details." },
      { status: 400 },
    );
  const data = parsed.data;
  const baseSalaryPaise = Math.round(data.baseSalary * 100);
  const bonusPaise = Math.round(data.bonus * 100);
  const advanceDeductionPaise = Math.round(data.advanceDeduction * 100);
  const otherDeductionPaise = Math.round(data.otherDeduction * 100);
  const netPayPaise = baseSalaryPaise + bonusPaise - advanceDeductionPaise - otherDeductionPaise;
  if (netPayPaise < 0)
    return NextResponse.json(
      { message: "Deductions cannot exceed salary and bonus." },
      { status: 400 },
    );
  if (data.status === "paid" && (!data.paymentDate || !data.paymentMode))
    return NextResponse.json(
      { message: "Add payment date and mode for a paid salary." },
      { status: 400 },
    );
  const now = Date.now();
  const raw = getRawDb();
  try {
    const existing = await raw.prepare("SELECT id FROM payroll_entries WHERE owner_user_id = ? AND employee_key = ? AND salary_month = ?").bind(user.id, data.employeeKey, data.salaryMonth).first<{ id: string }>();
    if (existing) {
      const posted = await raw.prepare("SELECT id FROM journal_entries WHERE owner_user_id = ? AND source_type = 'payroll' AND source_id = ? LIMIT 1").bind(user.id, existing.id).first();
      if (posted) return NextResponse.json({ message: "This paid salary is already in the books. Record a correcting journal instead of changing it." }, { status: 409 });
    }
    if (advanceDeductionPaise > 0) {
      const advanceRow = await raw
          .prepare(
            "SELECT COALESCE(SUM(amount_paise - applied_paise),0) AS available FROM payment_advances WHERE owner_user_id = ? AND advance_type = 'employee_paid' AND party_id = ? AND status != 'refunded'",
          )
          .bind(user.id, data.employeeKey)
          .first<Record<string, unknown>>();
      const available = Math.max(0, Number(advanceRow?.available || 0));
      if (advanceDeductionPaise > available)
        return NextResponse.json(
          { message: "Salary advance deduction exceeds the employee’s open advance balance." },
          { status: 400 },
        );
    }
    const id = existing?.id || crypto.randomUUID();
    const save = raw.prepare(
        "INSERT INTO payroll_entries (id,owner_user_id,employee_key,employee_name,salary_month,base_salary_paise,bonus_paise,advance_deduction_paise,other_deduction_paise,net_pay_paise,payment_date,payment_mode,reference,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_user_id,employee_key,salary_month) DO UPDATE SET employee_name=excluded.employee_name,base_salary_paise=excluded.base_salary_paise,bonus_paise=excluded.bonus_paise,advance_deduction_paise=excluded.advance_deduction_paise,other_deduction_paise=excluded.other_deduction_paise,net_pay_paise=excluded.net_pay_paise,payment_date=excluded.payment_date,payment_mode=excluded.payment_mode,reference=excluded.reference,status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at",
      )
      .bind(
        id,
        user.id,
        data.employeeKey,
        data.employeeName,
        data.salaryMonth,
        baseSalaryPaise,
        bonusPaise,
        advanceDeductionPaise,
        otherDeductionPaise,
        netPayPaise,
        blank(data.paymentDate),
        blank(data.paymentMode),
        blank(data.reference),
        data.status,
        blank(data.notes),
        now,
        now,
      );
    if (data.status === "paid") {
      await assertPeriodOpen(user.id, data.paymentDate);
      const journal = await prepareJournal({ ownerUserId: user.id, actor: user.email, entryDate: data.paymentDate, sourceType: "payroll", sourceId: id, description: `Salary · ${data.employeeName} · ${data.salaryMonth}`, lines: payrollEntry(baseSalaryPaise + bonusPaise, advanceDeductionPaise, otherDeductionPaise, netPayPaise, data.paymentMode === "cash") });
      const applications = advanceDeductionPaise > 0 ? [raw.prepare("UPDATE payment_advances SET applied_paise = MIN(amount_paise, applied_paise + ?), status = CASE WHEN applied_paise + ? >= amount_paise THEN 'applied' ELSE 'active' END, updated_at = ? WHERE id = (SELECT id FROM payment_advances WHERE owner_user_id = ? AND advance_type = 'employee_paid' AND party_id = ? AND status != 'refunded' AND applied_paise < amount_paise ORDER BY advance_date LIMIT 1)").bind(advanceDeductionPaise, advanceDeductionPaise, now, user.id, data.employeeKey)] : [];
      await raw.batch([save, ...applications, ...journal.statements]);
    } else {
      await save.run();
    }
    return NextResponse.json({ message: data.status === "paid" ? "Salary paid and posted to the books." : "Salary record saved." }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    console.error("Payroll save failed", error);
    return NextResponse.json({ message: "Salary record could not be saved." }, { status: 500 });
  }
}
