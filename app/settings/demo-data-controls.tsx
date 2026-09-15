"use client";
import { companyFetch } from "@/app/company-fetch";
import { useState } from "react";
import { Database,RefreshCcw,Trash2 } from "lucide-react";

export default function DemoDataControls(){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [confirm,setConfirm]=useState(false);
  async function act(action:"populate"|"reset"){
    setBusy(true);setMessage("");
    const response=await companyFetch("/api/settings/demo-data",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,confirmation:action==="reset"?"RESET DEMO":""})});
    const body=await response.json();setBusy(false);setConfirm(false);setMessage(body.message||"Demo data updated.");
  }
  return <section className="integration-card demo-controls">
    <div className="integration-title"><Database/><div><span>Demo workspace</span><h2>Sample business data</h2></div></div>
    <p className="settings-copy">Load a connected sample containing customers, products, purchases, a bill, payment, payroll and balanced accounting entries. Your own records are never replaced.</p>
    <div className="settings-actions"><button className="submit-button" type="button" disabled={busy} onClick={()=>act("populate")}><RefreshCcw/> {busy?"Working…":"Populate demo data"}</button><button className="secondary-button danger-button" type="button" disabled={busy} onClick={()=>setConfirm(true)}><Trash2/> Reset demo data</button></div>
    {confirm&&<div className="reset-confirm" role="alert"><strong>Remove only generated demo records?</strong><p>Your business records will remain untouched.</p><div><button type="button" onClick={()=>act("reset")}>Yes, reset demo</button><button type="button" onClick={()=>setConfirm(false)}>Cancel</button></div></div>}
    {message&&<p className="form-success">{message}</p>}
  </section>
}
