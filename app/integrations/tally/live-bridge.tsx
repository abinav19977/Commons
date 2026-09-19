"use client";
import { useEffect,useRef,useState } from "react";
import { companyFetch } from "@/app/company-fetch";
import { todayIST } from "@/app/lib/date";
import { CORE_ACCOUNTS } from "@/app/lib/accounting";
import DocumentHistory from "./document-history";
import ProgressWindow,{type TransferJob} from "./progress-window";
type Transfer={id:string;direction:string;label:string;status:string;message:string|null;updated_at:number};
type Recon={booksFrom:string|null;hasBalances:number;openingsPosted:boolean;openingLedgers:number;checked:number;matched:number;differing:number;totalAbsDifference:number;rows:{name:string;group:string|null;tally:number;commons:number;diff:number}[];vouchers:number};
type State={bridge:null|{tally_name:string;tally_guid:string|null;last_seen:number|null;revoked:number;expires_at:number};transfers:Transfer[];documents?:{id:string;kind:string;created_at:number;revision:string}[];queued?:number;unmapped?:{name:string;count:number}[]};
export default function LiveBridge({onReview}:{onReview:(xml:string,name:string)=>void}){
 const [data,setData]=useState<State>({bridge:null,transfers:[]});const [name,setName]=useState("");const [token,setToken]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const [now,setNow]=useState(()=>Date.now());
 const [from,setFrom]=useState(todayIST());const [to,setTo]=useState(todayIST());
 const [preview,setPreview]=useState<{key:string;label:string;date:string;amountPaise:number;digest:string}[]|null>(null);
 async function refresh(){try{const response=await companyFetch("/api/integrations/tally/bridge");const body=await response.json();if(!response.ok)throw Error(body.message);setData(body);setNow(Date.now());if(body.bridge)setName(body.bridge.tally_name);}catch(e){setMessage(e instanceof Error?e.message:"Could not load connection.");}}
 useEffect(()=>{const first=setTimeout(refresh,0);const timer=setInterval(refresh,15000);return ()=>{clearTimeout(first);clearInterval(timer);};},[]);
 async function act(action:string,extra:Record<string,unknown>={}){setBusy(true);setMessage("");try{const response=await companyFetch("/api/integrations/tally/bridge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,name,from,to,...extra})});const body=await response.json();if(!response.ok)throw Error(body.message);if(body.token)setToken(body.token);if(body.vouchers)setPreview(body.vouchers);else setMessage(body.message||"Saved.");if(action==="queue")setPreview(null);await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Request failed.");}finally{setBusy(false);}}
 async function review(item:Transfer){try{const response=await companyFetch(`/api/integrations/tally/bridge?inbox=${encodeURIComponent(item.id)}`);const body=await response.json();if(!response.ok)throw Error(body.message);onReview(body.xml,`Tally · ${item.label}`);}catch(e){setMessage(e instanceof Error?e.message:"Could not open voucher.");}}
 const queued=data.queued||0;
 const [job,setJob]=useState<TransferJob|null>(null);const stopRef=useRef(false);
 useEffect(()=>{if(!job||job.finished)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[job]);
 async function importQueue(){
  stopRef.current=false;setBusy(true);setMessage("");
  const startedAt=Date.now();
  let imported=0,duplicates=0,needsMapping=0,total=queued;
  setJob({title:"Importing vouchers from Tally",total,done:0,imported:0,held:0,already:0,startedAt,finished:false,stopping:false});
  let error="";
  try{
   for(;;){
    const response=await companyFetch("/api/integrations/tally/bridge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"import_queue",confirmation:"IMPORT TALLY"})});
    const body=await response.json();if(!response.ok)throw Error(body.message);
    imported+=body.imported;duplicates+=body.duplicates;needsMapping+=body.needsMapping;
    const done=imported+duplicates+needsMapping;
    total=Math.max(total,done+body.remaining);
    setJob(j=>j?{...j,total,done,imported,already:duplicates,held:needsMapping,stopping:stopRef.current}:j);
    if(body.remaining===0||stopRef.current)break;
   }
   setMessage(`${imported} voucher${imported===1?"":"s"} imported, ${duplicates} already up to date, ${needsMapping} need manual review (use "Review voucher" below).`);
  }catch(e){error=e instanceof Error?e.message:"Import failed.";setMessage(error);}
  setJob(j=>j?{...j,finished:true,stopping:false,error:error||undefined}:j);
  await refresh();setBusy(false);
 }
 const [mapChoice,setMapChoice]=useState<Record<string,string>>({});
 const suggest=(name:string)=>/petty\s*cash|^cash/i.test(name)?"1000":"";
 async function saveMappings(){
  const mappings=Object.fromEntries((data.unmapped||[]).map(u=>[u.name,mapChoice[u.name]??suggest(u.name)]).filter(([,code])=>code));
  if(!Object.keys(mappings).length){setMessage("Choose an account for at least one ledger first.");return;}
  setBusy(true);setMessage("Saving…");
  try{const response=await companyFetch("/api/integrations/tally/bridge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"map_ledgers",mappings})});const body=await response.json();if(!response.ok)throw Error(body.message);setMapChoice({});await refresh();setBusy(false);await importQueue();return;}
  catch(e){setMessage(e instanceof Error?e.message:"Could not save.");}
  setBusy(false);
 }
 const [recon,setRecon]=useState<Recon|null>(null);
 const drcr=(p:number)=>`₹${Math.abs(p/100).toLocaleString("en-IN",{minimumFractionDigits:2})} ${p<0?"Dr":"Cr"}`;
 async function checkTally(){
  setBusy(true);setMessage("Comparing with Tally…");
  try{const response=await companyFetch("/api/integrations/tally/bridge?reconcile=1");const body=await response.json();if(!response.ok)throw Error(body.message);setRecon(body);setMessage("");}
  catch(e){setMessage(e instanceof Error?e.message:"Could not compare.");}
  setBusy(false);
 }
 async function postOpenings(){
  setBusy(true);setMessage("Posting opening balances…");
  try{const response=await companyFetch("/api/integrations/tally/bridge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"post_openings",confirmation:"POST TALLY OPENINGS"})});const body=await response.json();if(!response.ok)throw Error(body.message);setMessage(body.message);}
  catch(e){setMessage(e instanceof Error?e.message:"Could not post.");}
  setBusy(false);await checkTally();
 }
 const bridge=data.bridge;const online=!!bridge?.last_seen&&now-bridge.last_seen<90000&&!bridge.revoked&&bridge.expires_at>now;
 return <section className="tally-panel"><div className="tally-panel-heading"><div><span>Windows connector</span><h2>Connect your TallyPrime company</h2></div><strong>{online?"Connector online":bridge?.revoked?"Disconnected":"Waiting for connector"}</strong></div>
 <p className="tally-note">Outgoing transfers send approved accounting vouchers. Supported incoming sales, purchases and receipts update Business and Accounting together, including stock and supplied batch allocations. Revisions and cancellations need review. Statutory filing, outbound inventory and physical deletions are not automated.</p>
 <ol className="bridge-instructions"><li><a href="/downloads/commons-tally-connector.zip" download>Download the Windows connector</a>. Extract the ZIP and open <b>Start Commons Connector.cmd</b>. Python 3.11 or later is required.</li><li>In TallyPrime, enable the HTTP service on port 9000 and open your company. In the connector, click <b>Find Tally companies</b>.</li><li>Enter that exact Tally company name below and generate a connection key. Paste the key into the connector, select the company, then click <b>Connect & start</b>.</li></ol>
 <label className="bridge-field">Tally company name<input value={name} readOnly={!!bridge} onChange={e=>setName(e.target.value)} placeholder="Exact name from TallyPrime"/></label>
 <div className="settings-actions"><button disabled={busy||!name} onClick={()=>act("pair")}>{bridge?"Replace connection key":"Generate connection key"}</button>{bridge&&!bridge.revoked&&<button disabled={busy} onClick={()=>act("revoke")}>Disconnect connector</button>}</div>
 {token&&<div className="bridge-secret"><p>Copy this key now. It expires in 90 days. A replacement immediately invalidates the old key.</p><input aria-label="Connection key" readOnly value={token} onFocus={e=>e.target.select()}/><button onClick={()=>{navigator.clipboard.writeText(token).then(()=>setMessage("Key copied.")).catch(()=>setMessage("Select the key and copy it manually."));}}>Copy key</button><button onClick={()=>setToken("")}>Hide key</button></div>}
 {bridge&&<p className="tally-note">{bridge.tally_guid?"Tally company identity verified":"Company identity will be verified on connection"}. Last contact: {bridge.last_seen?new Date(bridge.last_seen).toLocaleString():"Not connected yet"}.</p>}
 <h3>Send approved vouchers</h3><p className="tally-note">Import Commons masters using “Send to Tally” first. Review a short date range, then approve the vouchers below. Already queued entries and Tally imports are excluded.</p>
 <div className="tally-date-range"><label>From<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPreview(null);}}/></label><label>To<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPreview(null);}}/></label></div>
 <button disabled={busy||!bridge?.tally_guid||!!bridge?.revoked} onClick={()=>act("preview")}>Review outgoing vouchers</button>
 {preview&&<div className="bridge-review"><p>{preview.length} new vouchers</p>{preview.map(v=><p key={v.key}>{v.date} · {v.label} · ₹{(v.amountPaise/100).toLocaleString("en-IN",{minimumFractionDigits:2})}</p>)}{!!preview.length&&<button disabled={busy} onClick={()=>act("queue",{reviewed:preview,confirmation:"SEND TO TALLY"})}>Approve & send these {preview.length} vouchers</button>}</div>}
 {message&&<p role="status" className="directory-notice">{message}</p>}
 <h3>Transfer activity</h3><p className="tally-note">The latest 100 transfers are shown. “Delivery uncertain” means a confirmation was lost; checking delivery never posts again.</p>
 <div className="bridge-review"><h3>Match with Tally</h3><p className="tally-note">Compares every ledger's closing balance in Tally with what Commons holds (opening balance plus imported vouchers). Where they agree, your books match Tally exactly.</p>
 <button disabled={busy||!bridge} onClick={checkTally}>Check against Tally</button>
 {recon&&<div>
  {!recon.hasBalances&&<p className="tally-note">Tally's balances haven't arrived yet. In the connector click <b>Connect &amp; start</b> (use the latest connector) and check again.</p>}
  {recon.hasBalances>0&&<p><b>{recon.matched} of {recon.checked}</b> ledgers match Tally{recon.differing>0?` · ${recon.differing} differ (total gap ${drcr(recon.totalAbsDifference).replace(/ (Dr|Cr)$/,"")})`:" — everything agrees"}.</p>}
  {recon.hasBalances>0&&!recon.openingsPosted&&recon.openingLedgers>0&&<div><p className="tally-note">Tally's opening balances ({recon.openingLedgers} ledgers, as at {recon.booksFrom}) are not in Commons yet. Until they are, balance sheet figures will be short of Tally's.</p><button disabled={busy} onClick={postOpenings}>Post Tally opening balances</button></div>}
  {recon.openingsPosted&&<p className="tally-note">Tally's opening balances are posted (as at {recon.booksFrom}).</p>}
  {recon.rows.length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr><th align="left">Ledger</th><th align="right">Tally</th><th align="right">Commons</th><th align="right">Difference</th></tr></thead><tbody>{recon.rows.map(r=><tr key={r.name} style={{borderTop:"1px solid #252525"}}><td>{r.name}</td><td align="right">{drcr(r.tally)}</td><td align="right">{drcr(r.commons)}</td><td align="right">{drcr(r.diff)}</td></tr>)}</tbody></table>{recon.differing>recon.rows.length&&<p className="tally-note">Showing the {recon.rows.length} largest differences.</p>}</div>}
 </div>}
 </div>
 {!!data.unmapped?.length&&<div className="bridge-review"><h3>{data.unmapped.length} ledger{data.unmapped.length===1?"":"s"} need an account type</h3><p className="tally-note">Tally files these under groups Commons can't classify on its own. Pick the closest Commons account once for each and every voucher waiting on it is imported. Your accountant can refine the choices later.</p>
 {data.unmapped.map(u=><label className="bridge-field" key={u.name}>{u.name} <small>· blocks {u.count} voucher{u.count===1?"":"s"}</small><select value={mapChoice[u.name]??suggest(u.name)} onChange={e=>setMapChoice(c=>({...c,[u.name]:e.target.value}))}><option value="">Choose account…</option>{CORE_ACCOUNTS.map(a=><option value={a.code} key={a.code}>{a.code} · {a.name}</option>)}</select></label>)}
 <button disabled={busy} onClick={saveMappings}>Save choices</button></div>}
 {queued>0&&<div className="bridge-review"><p>{queued} voucher{queued===1?"":"s"} received from Tally and waiting to be posted to Business and Accounting.</p><button disabled={busy} onClick={importQueue}>Import all queued vouchers</button></div>}
 {!data.transfers.length&&<p>No transfers yet.</p>}{data.transfers.map(item=><article className="bridge-transfer" key={item.id}><div><strong>{item.direction==="in"?"From Tally":"To Tally"} · {item.label}</strong><p>{item.status==="uncertain"?"Delivery uncertain":item.status}{item.message?` · ${item.message}`:""}</p></div>{item.direction==="in"&&(item.status==="review"||item.status==="needs_mapping")&&<button disabled={busy} onClick={()=>review(item)}>Review voucher</button>}{item.direction==="out"&&["sending","uncertain"].includes(item.status)&&<button disabled={busy} onClick={()=>act("reconcile",{transfer:item.id})}>Check delivery</button>}{item.status==="blocked"&&<button disabled={busy} onClick={()=>act("retry",{transfer:item.id})}>Retry after fixing</button>}</article>)}
 <DocumentHistory documents={data.documents||[]}/>
 {job&&<ProgressWindow job={job} now={now} onStop={()=>{stopRef.current=true;setJob(j=>j?{...j,stopping:true}:j);}} onClose={()=>setJob(null)}/>}
 </section>;
}
