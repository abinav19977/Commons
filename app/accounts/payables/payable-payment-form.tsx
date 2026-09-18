"use client";
import { companyFetch } from "@/app/company-fetch";
import { todayIST } from "@/app/lib/date";
import { FormEvent, useMemo, useState } from "react";

type Purchase={id:string;purchase_number:string;supplier_name:string;total_paise:number;tds_paise:number;paid_paise:number;purchase_date:string;msme_category:string;payment_terms_days:number};
const money=(value:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(value/100);
const netDue=(p:Purchase)=>p.total_paise-p.tds_paise-p.paid_paise;
// Section 43B(h): the deadline is the supplier's agreed term, but never more than 45
// days, and only Micro/Small enterprises get this protection (Medium is excluded).
function msmeDaysOverdue(p:Purchase){
  if(p.msme_category!=="micro"&&p.msme_category!=="small")return null;
  const limit=Math.min(45,p.payment_terms_days||45);
  const days=Math.floor((Date.now()-new Date(p.purchase_date+"T00:00:00Z").getTime())/86400000);
  return days-limit;
}

export default function PayablePaymentForm({purchases}:{purchases:Purchase[]}){
  const[selected,setSelected]=useState(purchases[0]?.id||"");
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const purchase=useMemo(()=>purchases.find(item=>item.id===selected),[purchases,selected]);
  const atRisk=purchases.filter(p=>{const d=msmeDaysOverdue(p);return d!==null&&d>0;});
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage("");setError("");const form=new FormData(event.currentTarget);const response=await companyFetch("/api/accounts/payables",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({purchaseId:selected,paymentDate:form.get("paymentDate"),amount:form.get("amount"),paymentMode:form.get("paymentMode"),reference:form.get("reference")})});const body=await response.json();setBusy(false);if(!response.ok){setError(body.message||"Could not save payment.");return}setMessage(body.message);setTimeout(()=>location.reload(),700)}
  if(!purchases.length)return <div className="empty-state"><h2>No supplier bills awaiting payment</h2><p>Receive a purchase first. Paid and ordered purchases are excluded.</p></div>;
  return <>
    {atRisk.length>0&&<div className="form-error" role="alert">
      <strong>{atRisk.length} bill{atRisk.length>1?"s":""} from Micro/Small suppliers past the 45-day limit</strong>
      <p>Under Section 43B(h) of the Income Tax Act, these amounts risk being disallowed as a deduction this year unless paid before filing: {atRisk.map(p=>`${p.supplier_name} (${p.purchase_number}, ${msmeDaysOverdue(p)}d overdue)`).join("; ")}.</p>
    </div>}
    <form className="plain-book-form" onSubmit={submit}><div className="form-grid">
    <label className="span-2"><span>Supplier bill</span><select value={selected} onChange={event=>setSelected(event.target.value)}>{purchases.map(item=>{const overdue=msmeDaysOverdue(item);return <option value={item.id} key={item.id}>{item.purchase_number} · {item.supplier_name} · due {money(netDue(item))}{item.tds_paise?` (net of ${money(item.tds_paise)} TDS)`:""}{overdue!==null&&overdue>0?` · MSME ${overdue}d overdue`:""}</option>;})}</select></label>
    <label><span>Payment date</span><input type="date" name="paymentDate" defaultValue={todayIST()} required/></label>
    <label><span>Amount</span><div className="money-input"><b>₹</b><input name="amount" inputMode="decimal" defaultValue={purchase?(netDue(purchase)/100).toFixed(2):""} required/></div></label>
    <label><span>Payment mode</span><select name="paymentMode" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
    <label><span>Reference</span><input name="reference" placeholder="UTR, cheque or receipt number"/></label>
  </div>{purchase&&<div className="auto-book-preview"><div><strong>{purchase.supplier_name}</strong><span>Bill {money(purchase.total_paise)}{purchase.tds_paise?` · TDS withheld ${money(purchase.tds_paise)}`:""} · Paid {money(purchase.paid_paise)} · Balance {money(netDue(purchase))}</span></div></div>}{error&&<p className="form-error">{error}</p>}{message&&<p className="form-success">{message}</p>}<button className="submit-button" disabled={busy}>{busy?"Saving…":"Record supplier payment"}</button></form>
  </>;
}
