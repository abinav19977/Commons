import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import EmployeeForm from "./employee-form";

export const dynamic = "force-dynamic";
function CommonsMark() {
  return (
    <svg
      className="brand-mark brand-mark-small"
      aria-hidden="true"
      viewBox="0 0 128 128"
      fill="none"
    >
      <path
        d="M99 34A47 47 0 1 0 99 94"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="square"
      />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}
export default async function NewEmployeePage() {
  await requireChatGPTUser("/employees/new");
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/employees"
          aria-label="Back to Employees"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-form-wrap" aria-label="Add employee">
        <a className="back-link" href="/employees">
          ← Employees
        </a>
        <EmployeeForm />
      </section>
      <CommonsAssistant context="employees" />
    </main>
  );
}
