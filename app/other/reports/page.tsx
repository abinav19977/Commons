import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { getBusinessMetrics, type BusinessMetrics } from "../../lib/metrics";
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
export default async function ReportsPage() {
  const user = await requireChatGPTUser("/other/reports");
  let m: BusinessMetrics = {
    customers: 0,
    products: 0,
    employees: 0,
    invoices: 0,
    revenuePaise: 0,
    lowStock: 0,
    overdueReceivables: 0,
    overduePaise: 0,
    pendingPayroll: 0,
    pendingPayrollPaise: 0,
    bankReview: 0,
  };
  let unavailable = false;
  try {
    m = await getBusinessMetrics(user.id);
  } catch (error) {
    console.error("Reports unavailable", error);
    unavailable = true;
  }
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/other">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="dashboard">
        <a className="back-link" href="/other">
          ← Other
        </a>
        <div className="dashboard-heading">
          <div>
            <span>Business health</span>
            <h1>Reports</h1>
          </div>
        </div>
        {unavailable && (
          <p className="directory-notice">
            Live report data is temporarily unavailable.
          </p>
        )}
        <div className="dashboard-metrics">
          <div>
            <span>Total billed</span>
            <strong>
              {money(m.revenuePaise)}
            </strong>
            <small>{m.invoices} invoices</small>
          </div>
          <div>
            <span>Customers</span>
            <strong>{m.customers}</strong>
            <small>saved accounts</small>
          </div>
          <div>
            <span>Products</span>
            <strong>{m.products}</strong>
            <small>
              {m.lowStock}{" "}
              need attention
            </small>
          </div>
          <div>
            <span>Team</span>
            <strong>{m.employees}</strong>
            <small>active employees</small>
          </div>
        </div>
        <section className="report-note">
          <h2>Operational summary</h2>
          <p>
            Use the customer, product, transaction and employee modules to keep
            these figures current. Reports update automatically from saved
            records.
          </p>
        </section>
      </section>
      <CommonsAssistant context="dashboard" />
    </main>
  );
}
