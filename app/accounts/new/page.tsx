import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import MoneyEntryForm from "./money-entry-form";
import { getRawDb } from "../../../db";
import { CORE_ACCOUNTS } from "../../lib/accounting";
export const dynamic = "force-dynamic";
export default async function NewBookEntryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }){const user=await requireChatGPTUser("/accounts/new");const {kind}=await searchParams;const initialKind=kind==="money_out"||kind==="transfer"||kind==="adjustment"?kind:"money_in";const custom=(await getRawDb().prepare("SELECT code,name FROM ledger_accounts WHERE owner_user_id=? AND active=1 ORDER BY code").bind(user.id).all<{code:string;name:string}>()).results;const accounts=[...CORE_ACCOUNTS.map(({code,name})=>({code,name})),...custom.filter(item=>!CORE_ACCOUNTS.some(core=>core.code===item.code))];return <main className="form-shell"><section className="customer-form-wrap accounting-surface"><a className="back-link" href="/accounts">← Commons Books</a><div className="surface-heading"><span>Record money</span><h1>What happened?</h1><p>Choose the event you recognise. Commons creates the debit and credit automatically.</p></div><MoneyEntryForm initialKind={initialKind} accounts={accounts}/></section><CommonsAssistant context="accounts"/></main>}
