import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import MoneyEntryForm from "./money-entry-form";
export const dynamic = "force-dynamic";
export default async function NewBookEntryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }){await requireChatGPTUser("/accounts/new");const {kind}=await searchParams;const initialKind=kind==="money_out"||kind==="transfer"||kind==="adjustment"?kind:"money_in";return <main className="form-shell"><section className="customer-form-wrap accounting-surface"><a className="back-link" href="/accounts">← Commons Books</a><div className="surface-heading"><span>Record money</span><h1>What happened?</h1><p>Choose the event you recognise. Commons creates the debit and credit automatically.</p></div><MoneyEntryForm initialKind={initialKind}/></section><CommonsAssistant context="accounts"/></main>}
