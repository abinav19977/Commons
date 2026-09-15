import { ArrowLeftRight, ShieldCheck } from "lucide-react";
import { getRawDb } from "../../../db";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import TallyWorkspace from "./tally-workspace";

export const dynamic = "force-dynamic";

type CountRow = { count: number };
function Mark(){return <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none"><path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15"/><path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7"/></svg>}

export default async function TallyIntegrationPage() {
  const user = await requireChatGPTUser("/integrations/tally");
  const raw = getRawDb();
  let counts = { customers: 0, suppliers: 0, products: 0, vouchers: 0, imported: 0 };
  try {
    const [customers, suppliers, products, vouchers, imported] = await Promise.all([
      raw.prepare("SELECT COUNT(*) count FROM customers WHERE owner_user_id=?").bind(user.id).first<CountRow>(),
      raw.prepare("SELECT COUNT(*) count FROM suppliers WHERE owner_user_id=?").bind(user.id).first<CountRow>(),
      raw.prepare("SELECT COUNT(*) count FROM products WHERE owner_user_id=? AND active=1").bind(user.id).first<CountRow>(),
      raw.prepare("SELECT COUNT(*) count FROM journal_entries WHERE owner_user_id=? AND status='posted'").bind(user.id).first<CountRow>(),
      raw.prepare("SELECT COUNT(*) count FROM journal_entries WHERE owner_user_id=? AND source_type='tally_import'").bind(user.id).first<CountRow>(),
    ]);
    counts = { customers: customers?.count || 0, suppliers: suppliers?.count || 0, products: products?.count || 0, vouchers: vouchers?.count || 0, imported: imported?.count || 0 };
  } catch (error) { console.error("Tally integration summary unavailable", error); }
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const financialYearStart = `${Number(today.slice(5, 7)) < 4 ? year - 1 : year}-04-01`;
  return <main className="form-shell tally-shell">
    <header className="site-header workspace-header"><a className="wordmark" href="/"><Mark/></a><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
    <section className="tally-centre">
      <a className="back-link" href="/workspace">← Workspace</a>
      <div className="tally-hero"><div><span>Tally integration</span><h1>Commons ↔ Tally</h1><p>Move masters and verified vouchers without retyping. Every inbound voucher is checked, mapped and previewed before it enters Commons Books.</p></div><div className="tally-seal"><ArrowLeftRight/><strong>Two-way ready</strong><small>XML exchange active</small></div></div>
      <div className="tally-assurance"><ShieldCheck/><p><strong>Your books remain controlled.</strong><span>Duplicate vouchers, unknown ledgers, unbalanced entries and locked dates are stopped before posting.</span></p></div>
      <TallyWorkspace counts={counts} defaultFrom={financialYearStart} defaultTo={today}/>
    </section>
    <CommonsAssistant context="tally"/>
  </main>;
}
