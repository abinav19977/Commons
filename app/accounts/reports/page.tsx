import { getRawDb } from "../../../db";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { CORE_ACCOUNTS, reportFromBalances } from "../../lib/accounting";

export const dynamic = "force-dynamic";
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
type BalanceRow = { account_code: string; account_name: string; debits: number; credits: number };
export default async function BookReportsPage() {
  const user = await requireChatGPTUser("/accounts/reports");
  let rows: BalanceRow[] = [];
  let entryCount = 0;
  try {
    const result = await getRawDb().prepare("SELECT account_code, account_name, SUM(debit_paise) debits, SUM(credit_paise) credits FROM journal_lines WHERE owner_user_id = ? GROUP BY account_code, account_name ORDER BY account_code").bind(user.id).all<BalanceRow>();
    rows = result.results;
    const count = await getRawDb().prepare("SELECT COUNT(*) count FROM journal_entries WHERE owner_user_id = ? AND status = 'posted'").bind(user.id).first<{ count: number }>();
    entryCount = count?.count || 0;
  } catch (error) { console.error("Book reports unavailable", error); }
  const natural: Record<string, number> = {};
  for (const row of rows) {
    const account = CORE_ACCOUNTS.find((item) => item.code === row.account_code);
    natural[row.account_code] = account?.normalSide === "credit" ? row.credits - row.debits : row.debits - row.credits;
  }
  const report = reportFromBalances(natural);
  const debitTotal = rows.reduce((sum, row) => sum + row.debits, 0);
  const creditTotal = rows.reduce((sum, row) => sum + row.credits, 0);
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface reports-surface">
    <a className="back-link" href="/accounts">← Commons Books</a>
    <div className="surface-heading report-title"><div><span>Business reports</span><h1>Your business, explained.</h1></div><div className="books-status"><b>{debitTotal === creditTotal ? "Books balanced" : "Balance needs review"}</b><small>{entryCount} posted entries · Accountant review pending</small></div></div>
    {!entryCount && <div className="directory-notice neutral">No accounting entries yet. Create a bill, receive a purchase or record money to build your reports. Use Settings only if you want to explore with clearly labelled demo data.</div>}
    <div className="report-tabs"><a href="#profit">Profit</a><a href="#position">What you own & owe</a><a href="#cash">Cash</a><a href="#trial">Accountant view</a></div>
    <section className="statement-card" id="profit"><header><span>Profit & loss</span><small>Current books</small></header><div className="statement-hero"><small>Estimated profit</small><strong>{money(report.profit)}</strong></div><dl><div><dt>Sales and other income</dt><dd>{money(report.income)}</dd></div><div><dt>Purchases and expenses</dt><dd>− {money(report.expenses)}</dd></div><div className="total"><dt>Profit before tax</dt><dd>{money(report.profit)}</dd></div></dl></section>
    <div className="statement-split"><section className="statement-card" id="position"><header><span>Balance sheet</span><small>Current position</small></header><dl><div><dt>What the business owns</dt><dd>{money(report.assets)}</dd></div><div><dt>What the business owes</dt><dd>{money(report.liabilities)}</dd></div><div><dt>Owner&apos;s money</dt><dd>{money(report.equity)}</dd></div><div><dt>Profit retained in business</dt><dd>{money(report.profit)}</dd></div><div className="total"><dt>Balance check</dt><dd>{money(report.assets - report.liabilities - report.equity - report.profit)}</dd></div></dl></section><section className="statement-card" id="cash"><header><span>Cash position</span><small>Current books</small></header><div className="statement-hero"><small>Cash and bank balance</small><strong>{money((natural["1000"] || 0) + (natural["1010"] || 0))}</strong></div><p className="statement-note">Use the manual money form when there is no bank statement. Reconcile imported statements when available.</p></section></div>
    <section className="statement-card trial-balance" id="trial"><header><span>Trial balance</span><small>Accountant view</small></header><div className="trial-head"><span>Account</span><span>Debit</span><span>Credit</span></div>{rows.map((row) => <div className="trial-row" key={row.account_code}><span><b>{row.account_code}</b>{row.account_name}</span><span>{row.debits ? money(row.debits) : "—"}</span><span>{row.credits ? money(row.credits) : "—"}</span></div>)}<div className="trial-row total"><span>Total</span><span>{money(debitTotal)}</span><span>{money(creditTotal)}</span></div></section>
    <p className="professional-note">For management use. GST returns and statutory financial statements must be reviewed and approved by your accountant before filing.</p>
  </section><CommonsAssistant context="accounts" /></main>;
}
