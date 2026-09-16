"use client";
import { companyFetch } from "@/app/company-fetch";
import { FormEvent, useMemo, useState } from "react";

type Purchase={id:string;purchase_number:string;supplier_name:string;total_paise:number;paid_paise:number;purchase_date:string};
const money=(value:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(value/100);

export default function PayablePaymentForm({purchases}:{purchases:Purchase[]}){
  const[selected,setSelected]=useState(purchases[0]?.id||"");
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const purchase=useMemo(()=>purchases.find(item=>item.id===selected),[purchases,selected]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage("");setError("");const form=new FormData(event.currentTarget);const response=await companyFetch("/api/accounts/payables",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({purchaseId:selected,paymentDate:form.get("paymentDate"),amount:form.get("amount"),paymentMode:form.get("paymentMode"),reference:form.get("reference")})});const body=await response.json();setBusy(false);if(!response.ok){setError(body.message||"Could not save payment.");return}setMessage(body.message);setTimeout(()=>location.reload(),700)}
  if(!purchases.length)return <div className="empty-state"><h2>No supplier bills awaiting payment</h2><p>Receive a purchase first. Paid and ordered purchases are excluded.</p></div>;
  return <form className="plain-book-form" onSubmit={submit}><div className="form-grid">
    <label className="span-2"><span>Supplier bill</span><select value={selected} onChange={event=>setSelected(event.target.value)}>{purchases.map(item=><option value={item.id} key={item.id}>{item.purchase_number} · {item.supplier_name} · due {money(item.total_paise-item.paid_paise)}</option>)}</select></label>
    <label><span>Payment date</span><input type="date" name="paymentDate" defaultValue={new Date().toISOString().slice(0,10)} required/></label>
    <label><span>Amount</span><div className="money-input"><b>₹</b><input name="amount" inputMode="decimal" defaultValue={purchase?((purchase.total_paise-purchase.paid_paise)/100).toFixed(2):""} required/></div></label>
    <label><span>Payment mode</span><select name="paymentMode" defaultValue="bank_transfer"><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
    <label><span>Reference</span><input name="reference" placeholder="UTR, cheque or receipt number"/></label>
  </div>{purchase&&<div className="auto-book-preview"><div><strong>{purchase.supplier_name}</strong><span>Bill {money(purchase.total_paise)} · Paid {money(purchase.paid_paise)} · Balance {money(purchase.total_paise-purchase.paid_paise)}</span></div></div>}{error&&<p className="form-error">{error}</p>}{message&&<p className="form-success">{message}</p>}<button className="submit-button" disabled={busy}>{busy?"Saving…":"Record supplier payment"}</button></form>;
}
