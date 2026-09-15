"use client";
import { useState } from "react";
export default function CompanyPicker({companies,active}:{companies:{id:string;legal_name:string;trade_name:string|null;city:string|null}[];active?:string}) {
  const [busy,setBusy]=useState(""); const [error,setError]=useState("");
  async function select(id:string) {setBusy(id);setError("");try {
    const response=await fetch("/api/companies/select",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    const data=await response.json(); if(!response.ok) throw new Error(data.message);
    window.location.assign("/workspace");
  } catch(e){setError(e instanceof Error?e.message:"Could not open company.");setBusy("");}}
  return <div>{error&&<p role="alert">{error}</p>}{companies.map(company=><button key={company.id} className="company-profile-card" style={{width:"100%",color:"white",background:"#080808",textAlign:"left",marginBottom:16,cursor:"pointer"}} disabled={!!busy} onClick={()=>select(company.id)}><div><h2>{company.trade_name||company.legal_name}</h2><p>{company.legal_name}{company.city?` · ${company.city}`:""}</p><small>{busy===company.id?"Opening…":active===company.id?"Selected company · Open workspace":"Open Business & Accounting →"}</small></div></button>)}</div>;
}
