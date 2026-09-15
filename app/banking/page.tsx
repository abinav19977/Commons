import { getRawDb } from "../../db";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";
import { demoBusinessProfile } from "../other/business/demo-profile";
import BankReconciliation from "./bank-reconciliation";
import { demoBankTransactions, getBankingData, type BankBatchView, type BankTransactionView } from "./banking-data";

export const dynamic = "force-dynamic";

function Mark() {
  return <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none"><path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" /><path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" /></svg>;
}

function last4(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

export default async function BankingPage() {
  const user = await requireChatGPTUser("/banking");
  let transactions: BankTransactionView[] = [];
  let batches: BankBatchView[] = [];
  let accountLast4 = "";
  let unavailable = false;
  try {
    const [data, profile] = await Promise.all([
      getBankingData(user.id),
      getRawDb().prepare("SELECT account_number FROM business_profiles WHERE owner_user_id = ? LIMIT 1").bind(user.id).first<Record<string, unknown>>(),
    ]);
    transactions = data.transactions;
    batches = data.batches;
    accountLast4 = last4(String(profile?.account_number || "")) || accountLast4;
  } catch (error) {
    console.error("Bank reconciliation unavailable", error);
    unavailable = true;
  }
  return (
    <main className="form-shell">
      <header className="site-header workspace-header"><a className="wordmark" href="/" aria-label="Back to Commons"><Mark /></a><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
      <section className="operations-page"><a className="back-link" href="/workspace">← Workspace</a><div className="operations-heading"><span>Banking</span><h1>Reconciliation</h1><p>Import a statement and complete uniquely matched customer payments.</p></div>{unavailable && <p className="directory-notice">Saved bank imports are temporarily unavailable.</p>}<BankReconciliation transactions={transactions} batches={batches} defaultAccountLast4={accountLast4} /></section>
      <CommonsAssistant context="banking" />
    </main>
  );
}
