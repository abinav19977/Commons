"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useMemo, useState } from "react";
import { Save } from "lucide-react";
import type { PayrollView } from "../finance-data";

export type PayrollEmployee = {
  id: string;
  name: string;
  salaryPaise: number;
  openAdvancePaise: number;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function PayrollWorkspace({
  initialPayroll,
  employees,
}: {
  initialPayroll: PayrollView[];
  employees: PayrollEmployee[];
}) {
  const first = employees[0];
  const [employeeKey, setEmployeeKey] = useState(first?.id || "");
  const [employeeName, setEmployeeName] = useState(first?.name || "");
  const [salaryMonth, setSalaryMonth] = useState(currentMonth());
  const [baseSalary, setBaseSalary] = useState(first ? String(first.salaryPaise / 100) : "0");
  const [bonus, setBonus] = useState("0");
  const [advanceDeduction, setAdvanceDeduction] = useState("0");
  const [otherDeduction, setOtherDeduction] = useState("0");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [reference, setReference] = useState("");
  const [payStatus, setPayStatus] = useState<"pending" | "paid" | "on_hold">("pending");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedEmployee = employees.find((item) => item.id === employeeKey);
  const netPay = useMemo(
    () =>
      Math.max(
        0,
        (Number(baseSalary) + Number(bonus) - Number(advanceDeduction) - Number(otherDeduction)) * 100,
      ),
    [baseSalary, bonus, advanceDeduction, otherDeduction],
  );
  const summary = useMemo(() => ({
    monthlyCost: initialPayroll.reduce((sum, item) => sum + item.netPayPaise, 0),
    pending: initialPayroll.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.netPayPaise, 0),
    paidCount: initialPayroll.filter((item) => item.status === "paid").length,
  }), [initialPayroll]);

  function chooseEmployee(value: string) {
    const employee = employees.find((item) => item.id === value);
    setEmployeeKey(value);
    setEmployeeName(employee?.name || "");
    setBaseSalary(String((employee?.salaryPaise || 0) / 100));
    setAdvanceDeduction("0");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await companyFetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeKey,
          employeeName,
          salaryMonth,
          baseSalary: Number(baseSalary),
          bonus: Number(bonus),
          advanceDeduction: Number(advanceDeduction),
          otherDeduction: Number(otherDeduction),
          paymentDate,
          paymentMode,
          reference,
          status: payStatus,
          notes,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not save salary.");
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save salary.");
    }
  }

  return (
    <>
      <div className="finance-summary payroll-summary">
        <div><span>Payroll records</span><strong>{initialPayroll.length}</strong><small>Across tracked months</small></div>
        <div><span>Recorded net payroll</span><strong>{money(summary.monthlyCost)}</strong><small>Current register total</small></div>
        <div><span>Pending salary</span><strong>{money(summary.pending)}</strong><small>{summary.paidCount} paid records</small></div>
      </div>
      <div className="finance-layout payroll-layout">
        <section className="finance-ledger">
          <div className="section-heading"><h2>Salary register</h2><span>{initialPayroll.length.toString().padStart(2, "0")}</span></div>
          <div className="finance-list">
            {initialPayroll.map((item) => (
              <article className="finance-row payroll-row" key={item.id}>
                <div className="finance-row-primary"><span>{item.salaryMonth}</span><strong>{item.employeeName}</strong><small>Gross {money(item.baseSalaryPaise + item.bonusPaise)} · deductions {money(item.advanceDeductionPaise + item.otherDeductionPaise)}</small></div>
                <div><span>Net pay</span><strong>{money(item.netPayPaise)}</strong></div>
                <div><span>Payment</span><strong>{item.paymentDate || "Not paid"}</strong></div>
                <span className={`finance-status ${item.status}`}>{item.status.replace("_", " ")}</span>
              </article>
            ))}
          </div>
        </section>
        <form className="finance-form" onSubmit={save}>
          <span className="panel-kicker">Monthly payroll</span>
          <h2>Salary record</h2>
          <label><span>Employee</span><select value={employeeKey} onChange={(event) => chooseEmployee(event.target.value)} required><option value="" disabled>Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
          {selectedEmployee && <div className="advance-availability"><span>Open salary advance</span><strong>{money(selectedEmployee.openAdvancePaise)}</strong></div>}
          <div className="finance-form-grid"><label><span>Salary month</span><input type="month" value={salaryMonth} onChange={(event) => setSalaryMonth(event.target.value)} required /></label><label><span>Base salary ₹</span><input type="number" min="0" step="0.01" value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} required /></label></div>
          <div className="finance-form-grid"><label><span>Bonus / allowance ₹</span><input type="number" min="0" step="0.01" value={bonus} onChange={(event) => setBonus(event.target.value)} /></label><label><span>Salary advance deduction ₹</span><input type="number" min="0" step="0.01" max={(selectedEmployee?.openAdvancePaise || 0) / 100 || undefined} value={advanceDeduction} onChange={(event) => setAdvanceDeduction(event.target.value)} /></label></div>
          <label><span>Other deduction ₹</span><input type="number" min="0" step="0.01" value={otherDeduction} onChange={(event) => setOtherDeduction(event.target.value)} /></label>
          <div className="net-pay-preview"><span>Calculated net pay</span><strong>{money(netPay)}</strong></div>
          <label><span>Status</span><select value={payStatus} onChange={(event) => setPayStatus(event.target.value as typeof payStatus)}><option value="pending">Pending</option><option value="paid">Paid</option><option value="on_hold">On hold</option></select></label>
          {payStatus === "paid" && <div className="finance-form-grid"><label><span>Payment date</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label><label><span>Payment mode</span><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} required><option value="" disabled>Select mode</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label></div>}
          <label><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank or payroll reference" /></label>
          <label><span>Notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className={`form-status ${status}`} role="status">{message}</div>
          <button className="dashboard-primary finance-save" disabled={status === "saving"}><Save />{status === "saving" ? "Saving…" : "Save salary"}</button>
        </form>
      </div>
    </>
  );
}
