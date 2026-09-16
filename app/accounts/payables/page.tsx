import { getRawDb } from "../../../db";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import PayablePaymentForm from "./payable-payment-form";

export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const user = await requireChatGPTUser("/accounts/payables");
  const result = await getRawDb().prepare("SELECT id,purchase_number,supplier_name,total_paise,paid_paise,purchase_date FROM purchases WHERE owner_user_id=? AND status NOT IN ('ordered','cancelled','paid') AND total_paise>paid_paise ORDER BY purchase_date,id")
    .bind(user.id).all<{id:string;purchase_number:string;supplier_name:string;total_paise:number;paid_paise:number;purchase_date:string}>();
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface">
    <a className="back-link" href="/accounts">← Commons Books</a>
    <div className="surface-heading"><span>Supplier bills</span><h1>Pay exactly what you owe.</h1><p>Select the supplier bill, record a full or partial payment, and Commons updates both the payable and the books.</p></div>
    <PayablePaymentForm purchases={result.results}/>
  </section><CommonsAssistant context="accounts"/></main>;
}
