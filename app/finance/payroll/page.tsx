import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { listEmployees } from "../../employees/employee-store";
import { listAdvances, listPayroll, type PayrollView } from "../finance-data";
import PayrollWorkspace, { type PayrollEmployee } from "./payroll-workspace";

export const dynamic = "force-dynamic";

function Mark() {
  return <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none"><path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" /><path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" /></svg>;
}

export default async function PayrollPage() {
  const user = await requireChatGPTUser("/finance/payroll");
  if (!["owner", "accountant"].includes(user.role)) {
    return (
      <main className="form-shell">
        <header className="site-header workspace-header"><a className="wordmark" href="/finance" aria-label="Back to Finance"><Mark /></a><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
        <section className="operations-page"><a className="back-link" href="/finance">← Finance</a><div className="operations-heading"><span>People finance</span><h1>Salary tracking</h1></div><p className="directory-notice">Owner or accountant access is required to view payroll and salary data.</p></section>
      </main>
    );
  }
  let payroll: PayrollView[] = [];
  let employees: PayrollEmployee[] = [];
  let unavailable = false;
  try {
    const [savedPayroll, savedEmployees, savedAdvances] = await Promise.all([
      listPayroll(user.id),
      listEmployees(user.id),
      listAdvances(user.id),
    ]);
    payroll = savedPayroll;
    const allAdvances = savedAdvances;
    const allEmployees = savedEmployees;
    employees = allEmployees.map((item) => ({
      id: item.id,
      name: item.name,
      salaryPaise: item.monthlySalaryPaise,
      openAdvancePaise: Math.max(
        0,
        allAdvances.filter((advance) => advance.advanceType === "employee_paid" && advance.partyId === item.id).reduce((sum, advance) => sum + advance.amountPaise - advance.appliedPaise, 0) -
          payroll.filter((entry) => entry.employeeKey === item.id).reduce((sum, entry) => sum + entry.advanceDeductionPaise, 0),
      ),
    }));
  } catch (error) {
    console.error("Payroll data unavailable", error);
    unavailable = true;
  }
  return (
    <main className="form-shell">
      <header className="site-header workspace-header"><a className="wordmark" href="/finance" aria-label="Back to Finance"><Mark /></a><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
      <section className="operations-page"><a className="back-link" href="/finance">← Finance</a><div className="operations-heading"><span>People finance</span><h1>Salary tracking</h1><p>Prepare monthly salary, recover advances and maintain a clear payment register.</p></div>{unavailable && <p className="directory-notice">Saved payroll records are temporarily unavailable.</p>}<PayrollWorkspace initialPayroll={payroll} employees={employees} /></section>
      <CommonsAssistant context="finance" />
    </main>
  );
}
