import { getRawDb } from "../../../db";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import ReceiptForm from "./receipt-form";
export const dynamic = "force-dynamic";
type OpenInvoice={id:string;invoiceNumber:string;customerName:string;totalPaise:number;paidPaise:number};
export default async function ReceiptsPage(){
  const user=await requireChatGPTUser("/accounts/receipts");
  let invoices:OpenInvoice[]=[];
  try {
    const result=await getRawDb().prepare("SELECT id,invoice_number AS invoiceNumber,customer_name AS customerName,total_paise AS totalPaise,paid_paise AS paidPaise FROM invoices WHERE owner_user_id = ? AND paid_paise < total_paise ORDER BY invoice_date DESC").bind(user.id).all<OpenInvoice>();
    invoices=result.results;
  } catch(error){console.error("Open invoices unavailable",error)}
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface"><a className="back-link" href="/accounts">← Commons Books</a><div className="surface-heading"><span>Customer receipt</span><h1>Match money to a bill.</h1><p>Choose the invoice and amount. Commons reduces the customer balance and updates cash or bank automatically.</p></div>{invoices.length?<ReceiptForm invoices={invoices}/>:<div className="empty-state"><h2>No unpaid invoices</h2><p>Create a bill first, or use Record Money for income not linked to an invoice.</p><a href="/transactions/new">Generate bill</a></div>}</section><CommonsAssistant context="accounts"/></main>
}
