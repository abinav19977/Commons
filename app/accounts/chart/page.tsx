import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { ledgerAccounts } from "../../../db/schema";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { CORE_ACCOUNTS } from "../../lib/accounting";
import ChartAccountForm from "./chart-account-form";
export const dynamic="force-dynamic";
export default async function ChartPage(){const user=await requireChatGPTUser("/accounts/chart");let saved:Array<{code:string;name:string;category:string;systemKey:string|null}>=[];try{saved=await getDb().select({code:ledgerAccounts.code,name:ledgerAccounts.name,category:ledgerAccounts.category,systemKey:ledgerAccounts.systemKey}).from(ledgerAccounts).where(eq(ledgerAccounts.ownerUserId,user.id)).orderBy(asc(ledgerAccounts.code))}catch(error){console.error("Chart unavailable",error)}const map=new Map<string,{code:string;name:string;category:string;systemKey:string|null}>(CORE_ACCOUNTS.map(a=>[a.code,{code:a.code,name:a.name,category:a.category,systemKey:a.systemKey}]));for(const a of saved)map.set(a.code,a);const accounts=[...map.values()];return <main className="form-shell"><section className="customer-form-wrap accounting-surface"><a className="back-link" href="/accounts">← Commons Books</a><div className="surface-heading"><span>Money categories</span><h1>Your chart of accounts.</h1><p>Commons uses these categories behind everyday actions. Accountants can add another category when needed.</p></div><div className="chart-list">{accounts.map(a=><div key={a.code}><span>{a.code}</span><strong>{a.name}</strong><small>{a.category}{a.systemKey?" · automatic":" · custom"}</small></div>)}</div><ChartAccountForm/></section><CommonsAssistant context="accounts"/></main>}
