import { notFound } from "next/navigation";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { demoEmployees, type EmployeeView } from "../employee-data";
import { findEmployee } from "../employee-store";

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
const money = (p: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(p / 100);
function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
async function EmployeeDetail({ id }: { id: string }) {
  const user = await requireChatGPTUser("/employees/" + encodeURIComponent(id));
  let employee: EmployeeView | null =
    demoEmployees.find((item) => item.id === id) || null;
  let unavailable = false;
  if (!employee) {
    try {
      employee = await findEmployee(user.id, id);
    } catch (error) {
      console.error("Employee detail unavailable", error);
      unavailable = true;
    }
  }
  if (unavailable)
    return (
      <div className="record-unavailable">
        Employee details are temporarily unavailable.
      </div>
    );
  if (!employee) notFound();
  return (
    <>
      <div className="customer-profile-heading">
        <span>
          {employee.status.replace("_", " ")} ·{" "}
          {employee.employmentType.replace("_", " ")}
        </span>
        <h1>{employee.name}</h1>
        <div className="profile-links">
          <a href="/finance/payroll">Open salary tracking</a>
          <a href="/finance/advances">Record salary advance</a>
        </div>
      </div>
      <section className="profile-section">
        <h2>Employment summary</h2>
        <div className="summary-grid">
          <div>
            <span>Role</span>
            <strong>{employee.role}</strong>
          </div>
          <div>
            <span>Department</span>
            <strong>{employee.department || "General"}</strong>
          </div>
          <div>
            <span>Monthly salary</span>
            <strong>{money(employee.monthlySalaryPaise)}</strong>
          </div>
          <div>
            <span>Joined</span>
            <strong>{employee.joiningDate || "—"}</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <Detail label="Phone" value={"+91 " + employee.phone} />
          <Detail label="Email" value={employee.email} />
          <Detail label="PAN" value={employee.pan} />
          <Detail
            label="Aadhaar"
            value={
              employee.aadhaarLast4 ? "•••• " + employee.aadhaarLast4 : null
            }
          />
          <Detail label="Address" value={employee.address} />
          <Detail label="Emergency contact" value={employee.emergencyContact} />
        </dl>
      </section>
    </>
  );
}
export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/employees/existing"
          aria-label="Back to employee list"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-profile">
        <a className="back-link" href="/employees/existing">
          ← Existing employees
        </a>
        <EmployeeDetail id={id} />
      </section>
      <CommonsAssistant context="employees" />
    </main>
  );
}
