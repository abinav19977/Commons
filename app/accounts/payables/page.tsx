import { getRawDb } from "../../../db";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import PayablePaymentForm from "./payable-payment-form";

export const dynamic = "force-dynamic";

export default async function PayablesPage() {
  const user = await requireChatGPTUser("/accounts/payables");
  // Net payable is the bill total less TDS already withheld — the supplier is never
  // actually due the full total_paise once TDS applies. MSME category/payment terms come
  // along so the UI can flag Section 43B(h) risk (Micro/Small suppliers unpaid beyond 45
  // days, or their agreed term if shorter, become a disallowed expense at year end).
  const result = await getRawDb().prepare(
    `SELECT p.id,p.purchase_number,p.supplier_name,p.total_paise,p.tds_paise,p.paid_paise,p.purchase_date,
            COALESCE(s.msme_category,'none') msme_category,COALESCE(s.payment_terms_days,45) payment_terms_days
     FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.owner_user_id=p.owner_user_id
     WHERE p.owner_user_id=? AND p.status NOT IN ('ordered','cancelled','paid') AND (p.total_paise-p.tds_paise)>p.paid_paise
     ORDER BY p.purchase_date,p.id`,
  ).bind(user.id).all<{id:string;purchase_number:string;supplier_name:string;total_paise:number;tds_paise:number;paid_paise:number;purchase_date:string;msme_category:string;payment_terms_days:number}>();
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface">
    <a className="back-link" href="/accounts">← Commons Books</a>
    <div className="surface-heading"><span>Supplier bills</span><h1>Pay exactly what you owe.</h1><p>Select the supplier bill, record a full or partial payment, and Commons updates both the payable and the books.</p></div>
    <PayablePaymentForm purchases={result.results}/>
  </section><CommonsAssistant context="accounts"/></main>;
}
