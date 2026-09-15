import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import AdjustmentForm from "./adjustment-form";
import { getDb } from "../../../db";
import { products } from "../../../db/schema";
import { asc, eq } from "drizzle-orm";
export const dynamic="force-dynamic";
export default async function ReturnsPage(){const user=await requireChatGPTUser("/accounts/returns");let items:Array<{id:string;name:string;unit:string}>=[];try{items=await getDb().select({id:products.id,name:products.name,unit:products.unit}).from(products).where(eq(products.ownerUserId,user.id)).orderBy(asc(products.name))}catch(error){console.error("Return products unavailable",error)}return <main className="form-shell"><section className="customer-form-wrap accounting-surface"><a className="back-link" href="/accounts">← Commons Books</a><div className="surface-heading"><span>Returns & corrections</span><h1>Reverse it cleanly.</h1><p>Choose what happened. Commons creates the correct note and reverses the accounting without deleting history.</p></div><AdjustmentForm products={items}/></section><CommonsAssistant context="accounts"/></main>}
