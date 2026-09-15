"use client";
import {splitTallyUpload,decodeTallyFile} from "../../lib/tally-upload";
import LiveBridge from "./live-bridge";
import { companyFetch } from "@/app/company-fetch";

import { ChangeEvent, useState } from "react";
import { AlertTriangle, Check, Download, FileCheck2, RefreshCw, Upload, X } from "lucide-react";

type PreviewVoucher = { key: string; date: string; type: string; number: string; narration: string; amountPaise: number; status: "ready" | "needs_mapping" | "duplicate"; issues: string[] };
type Preview = { total: number; ready: number; needsMapping: number; duplicates: number; vouchers: PreviewVoucher[] };
const accountOptions = [
  ["1000","Cash in hand"],["1010","Bank account"],["1100","Customer money due"],["1200","Stock on hand"],["1300","Input GST credit"],
  ["1400","Supplier advances"],["1410","Employee advances"],["2000","Supplier money due"],["2100","GST payable"],["2200","Customer advances"],
  ["2210","Payroll deductions payable"],["3000","Owner's capital"],["3100","Opening balance equity"],["4000","Sales"],["4010","Other income"],
  ["4090","Sales returned"],["5000","Goods purchased"],["5090","Purchases returned"],["5100","Cost of goods sold"],["6000","Business expenses"],["6100","Salary expense"],
];

export default function TallyWorkspace({ counts, defaultFrom, defaultTo }: { counts: { customers:number;suppliers:number;products:number;vouchers:number;imported:number }; defaultFrom:string;defaultTo:string }) {
  const [view, setView] = useState<"export"|"import"|"live">("export");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [xml, setXml] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [mappings, setMappings] = useState<Record<string,string>>({});

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setPreview(null); setMessage(""); setError("");setXml("");setFileName("");setConfirming(false);setMappings({});
    if (!file) return;
    try {
      if (file.size > 30_000_000) throw Error("Choose an XML file up to 30 MB.");
      const text = decodeTallyFile(await file.arrayBuffer());
      splitTallyUpload(text);
      setXml(text); setFileName(file.name);
    } catch(e){setError(e instanceof Error?e.message:"The XML file could not be read.");}
  }
  async function requestImport(action: "preview"|"commit") {
    if (!xml || busy) return;
    setBusy(true); setError(""); setMessage("");setConfirming(false);
    if(action==="preview")setPreview(null);
    let imported=0;
    try {
      const batches=splitTallyUpload(xml);
      const aggregate:Preview={total:0,ready:0,needsMapping:0,duplicates:0,vouchers:[]};
      for(let i=0;i<batches.length;i++){
        setMessage((action==="preview"?"Checking":"Importing")+" batch "+(i+1)+" of "+batches.length+"…");
        const response = await companyFetch("/api/integrations/tally/import", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action, xml:batches[i], mappings, confirmation:action === "commit" ? "IMPORT TALLY" : "" }) });
        const body = await response.json();
        if (!response.ok) throw Error(body.message || "The Tally file could not be checked.");
        imported+=body.imported||0;
        aggregate.vouchers.push(...body.vouchers.map((v:PreviewVoucher)=>({...v,key:i+":"+v.key})));
      }
      aggregate.total=aggregate.vouchers.length;
      aggregate.ready=aggregate.vouchers.filter(v=>v.status==="ready").length;
      aggregate.needsMapping=aggregate.vouchers.filter(v=>v.status==="needs_mapping").length;
      aggregate.duplicates=aggregate.vouchers.filter(v=>v.status==="duplicate").length;
      if(action==="preview"){setPreview(aggregate);setMessage("Checked all "+aggregate.total+" vouchers. Review the results before importing.");}
      else {setPreview(null);setMessage(imported+" vouchers imported. "+aggregate.needsMapping+" need review. Check the file again to review remaining items; previously imported vouchers are skipped.");}
    } catch(e) { setPreview(null);setMessage("");setError((e instanceof Error?e.message:"The import was interrupted.")+(action==="commit"?" "+imported+" imports confirmed before interruption. Some additional records may have completed. Check this file again before retrying; duplicates are skipped.":" No vouchers were imported.")); }
    finally { setBusy(false); }
  }
  const unknownLedgers = preview ? [...new Set(preview.vouchers.flatMap(voucher => voucher.issues.map(issue => issue.match(/Map ledger “(.+)”/)?.[1]).filter((name): name is string => Boolean(name))))] : [];
  return <>
    <nav className="tally-tabs" aria-label="Tally integration sections">
      <button className={view==="export"?"active":""} onClick={()=>setView("export")}><Download/>Send to Tally</button>
      <button className={view==="import"?"active":""} onClick={()=>setView("import")}><Upload/>Bring from Tally</button>
      <button className={view==="live"?"active":""} onClick={()=>setView("live")}><RefreshCw/>Live sync</button>
    </nav>
    {view==="export" && <section className="tally-panel">
      <div className="tally-panel-heading"><div><span>Commons → TallyPrime</span><h2>Export to TallyPrime</h2></div><small>Nothing is changed in Commons</small></div>
      <div className="tally-counts"><article><strong>{counts.customers}</strong><span>Customers</span></article><article><strong>{counts.suppliers}</strong><span>Suppliers</span></article><article><strong>{counts.products}</strong><span>Stock items</span></article><article><strong>{counts.vouchers}</strong><span>Posted vouchers</span></article></div>
      <div className="tally-export-grid"><article><FileCheck2/><div><h3>Step 1 · Masters</h3><p>Customers, suppliers, ledgers and stock items. Import this first in TallyPrime. Opening balances and generated demo records are excluded.</p><a href="/api/integrations/tally/export?scope=masters"><Download/>Download masters XML</a></div></article><article><FileCheck2/><div><h3>Step 2 · Vouchers</h3><p>Sales, purchases, receipts, payments, contra, journals and corrections for the selected period.</p><div className="tally-date-range"><label><span>From</span><input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label><span>To</span><input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label></div><a href={`/api/integrations/tally/export?scope=vouchers&from=${from}&to=${to}`}><Download/>Download vouchers XML</a></div></article></div>
      <details className="tally-note"><summary>Advanced exports · validate in a test company</summary><p>Item-invoice XML includes product quantities, ledger allocations and HSN details. It retains Commons stock-value and cost entries. An accountant must reconcile these against Tally’s inventory valuation settings before live use. Batch and warehouse allocations are not available for native Commons bills yet.</p><a href={`/api/integrations/tally/export?scope=vouchers&mode=items&from=${from}&to=${to}`}>Download item-invoice XML for validation</a><p>Standard masters exclude opening balances to avoid duplicating opening journals. If migrating openings separately, use the file below and exclude matching opening journals. Customer balances are debit; supplier balances are credit.</p><a href="/api/integrations/tally/export?scope=masters&openings=include">Download masters with opening balances</a></details>
      <p className="tally-note"><b>In TallyPrime:</b> Back up the company, then use Import Data → Masters followed by Import Data → Vouchers. Review Tally’s import summary before accepting exceptions.</p>
    </section>}
    {view==="import" && <section className="tally-panel">
      <div className="tally-panel-heading"><div><span>TallyPrime → Commons</span><h2>Preview before anything posts</h2></div><small>{counts.imported} previously imported</small></div>
      <label className="tally-upload"><Upload/><strong>{fileName || "Choose a Tally voucher XML"}</strong><span>{fileName ? "Ready to validate" : "Up to 30 MB · 2,000 vouchers · Automatically checked in batches"}</span><input type="file" accept=".xml,text/xml,application/xml" disabled={busy} onChange={chooseFile}/></label>
      <button className="submit-button tally-check" type="button" disabled={!xml||busy} onClick={()=>requestImport("preview")}>{busy?"Checking…":"Check file"}</button>
      {error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
      {preview && <div className="tally-preview"><div className="tally-preview-summary"><article><Check/><strong>{preview.ready}</strong><span>Ready</span></article><article><AlertTriangle/><strong>{preview.needsMapping}</strong><span>Needs review</span></article><article><RefreshCw/><strong>{preview.duplicates}</strong><span>Already imported</span></article></div>{unknownLedgers.length>0&&<div className="tally-mapping"><div><span>Ledger mapping</span><h3>Tell Commons what these Tally ledgers mean</h3></div>{unknownLedgers.map(name=><label key={name}><span>{name}</span><select disabled={busy} value={mappings[name.toLowerCase().trim()]||""} onChange={event=>setMappings(current=>({...current,[name.toLowerCase().trim()]:event.target.value}))}><option value="">Choose Commons account</option>{accountOptions.map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label>)}<button type="button" disabled={unknownLedgers.some(name=>!mappings[name.toLowerCase().trim()])||busy} onClick={()=>requestImport("preview")}>Apply mapping & recheck</button></div>}<div className="tally-voucher-list">{preview.vouchers.map(voucher=><article key={voucher.key}><span className={`tally-status ${voucher.status}`}>{voucher.status==="ready"?<Check/>:voucher.status==="duplicate"?<RefreshCw/>:<AlertTriangle/>}</span><div><strong>{voucher.type} · {voucher.number}</strong><small>{voucher.date||"No date"} · {voucher.narration}</small>{voucher.issues.length>0&&<em>{voucher.issues.join(" · ")}</em>}</div><b>₹{(voucher.amountPaise/100).toLocaleString("en-IN",{maximumFractionDigits:2})}</b></article>)}</div>{preview.ready>0&&!confirming&&<button className="submit-button" type="button" disabled={busy} onClick={()=>setConfirming(true)}>Import {preview.ready} reviewed voucher{preview.ready===1?"":"s"}</button>}{confirming&&<div className="tally-confirm"><div><AlertTriangle/><p><strong>Post these vouchers to Commons Books?</strong><span>This creates balanced journal entries and audit records. Duplicates and unresolved mappings will be skipped.</span></p></div><button type="button" onClick={()=>requestImport("commit")} disabled={busy}><Check/>Yes, import</button><button type="button" onClick={()=>setConfirming(false)}><X/>Cancel</button></div>}</div>}
    </section>}
    {view==="live" && <LiveBridge onReview={(text,name)=>{setXml(text);setFileName(name);setPreview(null);setMessage("");setError("");setView("import");}}/>}
  </>;
}
