import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { type EmployeeView } from "../employee-data";
import { listEmployees } from "../employee-store";
import ListToolbar from "../../components/list-toolbar";

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
export default async function ExistingEmployeesPage() {
  const user = await requireChatGPTUser("/employees/existing");
  let saved: EmployeeView[] = [];
  let unavailable = false;
  try {
    saved = await listEmployees(user.id);
  } catch (error) {
    console.error("Employee list unavailable", error);
    unavailable = true;
  }
  const directory = saved;
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
      <section className="customer-directory" aria-labelledby="employee-title">
        <a className="back-link" href="/employees">
          ← Employees
        </a>
        <div className="directory-heading">
          <h1 id="employee-title">Employees</h1>
          <span>{directory.length.toString().padStart(2, "0")}</span>
        </div>
        {unavailable && (
          <p className="directory-notice">
            Saved employees are temporarily unavailable.
          </p>
        )}
        <ListToolbar filters={[{label:"Active",value:"active"},{label:"On leave",value:"on leave"}]}/>
        <div className="customer-list">
          {directory.map((employee, index) => (
            <a
              className="customer-row"
              href={"/employees/" + employee.id}
              key={employee.id}
            >
              <span className="customer-index">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span className="customer-identity">
                <strong>{employee.name}</strong>
                <small>{employee.role}</small>
              </span>
              <span className="customer-phone">
                {employee.department || "General"}
              </span>
              <span className="customer-location">
                {employee.status.replace("_", " ")}
              </span>
              <span className="customer-arrow">↗</span>
            </a>
          ))}
        </div>
      </section>
      <CommonsAssistant context="employees" />
    </main>
  );
}
