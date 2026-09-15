import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { listCustomers } from "../../customers/customer-store";
import { listEmployees } from "../../employees/employee-store";
import { listSuppliers } from "../../purchases/supplier-store";
import { listAdvances, type AdvanceView } from "../finance-data";
import AdvanceWorkspace, { type AdvanceParty } from "./advance-workspace";

export const dynamic = "force-dynamic";

function Mark() {
  return <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none"><path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" /><path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" /></svg>;
}

export default async function AdvancesPage() {
  const user = await requireChatGPTUser("/finance/advances");
  let advances: AdvanceView[] = [];
  let parties: AdvanceParty[] = [];
  let unavailable = false;
  try {
    const [savedAdvances, customers, suppliers, employees] = await Promise.all([
      listAdvances(user.id),
      listCustomers(user.id),
      listSuppliers(user.id),
      listEmployees(user.id),
    ]);
    advances = savedAdvances;
    parties = [
      ...customers.map((item) => ({ id: item.id, name: item.displayName, kind: "customer" as const })),
      ...suppliers.map((item) => ({ id: item.id, name: item.name, kind: "supplier" as const })),
      ...employees.map((item) => ({ id: item.id, name: item.name, kind: "employee" as const })),
    ];
  } catch (error) {
    console.error("Finance advance data unavailable", error);
    unavailable = true;
  }
  return (
    <main className="form-shell">
      <header className="site-header workspace-header"><a className="wordmark" href="/finance" aria-label="Back to Finance"><Mark /></a><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
      <section className="operations-page"><a className="back-link" href="/finance">← Finance</a><div className="operations-heading"><span>Cash control</span><h1>Payment advances</h1><p>Track money received or paid before an invoice, purchase or salary settlement.</p></div>{unavailable && <p className="directory-notice">Saved finance records are temporarily unavailable.</p>}<AdvanceWorkspace initialAdvances={advances} parties={parties} /></section>
      <CommonsAssistant context="finance" />
    </main>
  );
}
