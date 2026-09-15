import {
  BarChart3,
  BellRing,
  BrainCircuit,
  FilePlus2,
  Landmark,
  PackagePlus,
  ShoppingCart,
  UserRoundPlus,
  WalletCards,
} from "lucide-react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";
import { getBusinessMetrics, type BusinessMetrics } from "../lib/metrics";
import { generateBusinessIntelligence } from "../lib/intelligence";
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
export default async function DashboardPage() {
  const user = await requireChatGPTUser("/dashboard");
  let metrics: BusinessMetrics = {
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
    metrics = await getBusinessMetrics(user.id);
  } catch (error) {
    console.error("Dashboard unavailable", error);
    unavailable = true;
  }
  const shown = metrics;
  const intelligence = await generateBusinessIntelligence(shown);
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="dashboard">
        <a className="back-link" href="/workspace">
          ← Workspace
        </a>
        <div className="dashboard-heading">
          <div>
            <span>Overview</span>
            <h1>Dashboard</h1>
          </div>
          <a className="dashboard-primary" href="/transactions/new">
            <FilePlus2 />
            Generate bill
          </a>
        </div>
        {unavailable && (
          <p className="directory-notice">
            Some live totals are temporarily unavailable.
          </p>
        )}
        <div className="dashboard-metrics">
          <div>
            <span>Revenue</span>
            <strong>{money(shown.revenuePaise)}</strong>
            <small>{shown.invoices} invoices</small>
          </div>
          <div>
            <span>Customers</span>
            <strong>{shown.customers}</strong>
            <small>active records</small>
          </div>
          <div>
            <span>Products</span>
            <strong>{shown.products}</strong>
            <small>{shown.lowStock} low stock</small>
          </div>
          <div>
            <span>Employees</span>
            <strong>{shown.employees}</strong>
            <small>active staff</small>
          </div>
          <div>
            <span>Receivables</span>
            <strong>{money(shown.overduePaise)}</strong>
            <small>{shown.overdueReceivables} need follow-up</small>
          </div>
        </div>
        <section className="intelligence-panel">
          <div className="intelligence-header">
            <div>
              <BrainCircuit />
              <div>
                <span>Live business briefing</span>
                <h2>Today&apos;s priorities</h2>
              </div>
            </div>
            <small>
              {intelligence.mode === "llm"
                ? "LLM analysis"
                : "Live analytical fallback"}
            </small>
          </div>
          <p className="intelligence-summary">{intelligence.summary}</p>
          <div className="intelligence-alerts">
            {intelligence.alerts.map((alert) => (
              <a
                className={`intelligence-alert ${alert.level}`}
                href={alert.href}
                key={alert.title}
              >
                <span>{alert.level}</span>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
                <small>{alert.actionLabel} →</small>
              </a>
            ))}
          </div>
        </section>
        <div className="dashboard-grid">
          <section>
            <div className="section-heading">
              <h2>Quick actions</h2>
            </div>
            <div className="quick-actions">
              <a href="/customers/new">
                <UserRoundPlus />
                <span>Add customer</span>
              </a>
              <a href="/products/new">
                <PackagePlus />
                <span>Add product</span>
              </a>
              <a href="/transactions/new">
                <FilePlus2 />
                <span>Generate bill</span>
              </a>
              <a href="/purchases/suppliers">
                <ShoppingCart />
                <span>Choose supplier</span>
              </a>
              <a href="/other/reports">
                <BarChart3 />
                <span>View reports</span>
              </a>
              <a href="/gst">
                <Landmark />
                <span>Review GST filing</span>
              </a>
              <a href="/receivables">
                <BellRing />
                <span>Send reminders</span>
              </a>
              <a href="/finance">
                <WalletCards />
                <span>Open finance</span>
              </a>
              <a href="/banking">
                <Landmark />
                <span>Reconcile bank</span>
              </a>
            </div>
          </section>
          <section>
            <div className="section-heading">
              <h2>Recent activity</h2>
              <a href="/transactions/existing">View all</a>
            </div>
            <a className="recent-invoice" href="/transactions/existing"><div><strong>Open transaction history</strong><span>Search, filter and review saved bills</span></div><strong>→</strong></a>
          </section>
        </div>
      </section>
      <CommonsAssistant context="dashboard" />
    </main>
  );
}
