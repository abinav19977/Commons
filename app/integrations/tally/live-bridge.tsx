"use client";
import { useEffect,useState } from "react";
import { companyFetch } from "@/app/company-fetch";
import DocumentHistory from "./document-history";
type Transfer={id:string;direction:string;label:string;status:string;message:string|null;updated_at:number};
type State={bridge:null|{tally_name:string;tally_guid:string|null;last_seen:number|null;revoked:number;expires_at:number};transfers:Transfer[];documents?:{id:string;kind:string;created_at:number;revision:string}[];queued?:number};
export default function LiveBridge({onReview}:{onReview:(xml:string,name:string)=>void}){
 const [data,setData]=useState<State>({bridge:null,transfers:[]});const [name,setName]=useState("");const [token,setToken]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const [now,setNow]=useState(()=>Date.now());
 const [from,setFrom]=useState(new Date().toISOString().slice(0,10));const [to,setTo]=useState(new Date().toISOString().slice(0,10));
 const [preview,setPreview]=useState<{key:string;label:string;date:string;amountPaise:number;digest:string}[]|null>(null);
 async function refresh(){try{const response=await companyFetch("/api/integrations/tally/bridge");const body=await response.json();if(!response.ok)throw Error(body.message);setData(body);setNow(Date.now());if(body.bridge)setName(body.bridge.tally_name);}catch(e){setMessage(e instanceof Error?e.message:"Could not load connection.");}}
 useEffect(()=>{const first=setTimeout(refresh,0);const timer=setInterval(refresh,15000);return ()=>{clearTimeout(first);clearInterval(timer);};},[]);
 async function act(action:string,extra:Record<string,unknown>={}){setBusy(true);setMessage("");try{const response=await companyFetch("/api/integrations/tally/bridge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,name,from,to,...extra})});const body=await response.json();if(!response.ok)throw Error(body.message);if(body.token)setToken(body.token);if(body.vouchers)setPreview(body.vouchers);else setMessage(body.message||"Saved.");if(action==="queue")setPreview(null);await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Request failed.");}finally{setBusy(false);}}
 async function review(item:Transfer){try{const response=await companyFetch(`/api/integrations/tally/bridge?inbox=${encodeURIComponent(item.id)}`);const body=await response.json();if(!response.ok)throw Error(body.message);onReview(body.xml,`Tally · ${item.label}`);}catch(e){setMessage(e instanceof Error?e.message:"Could not open voucher.");}}
 const queued=data.queued||0;
 async function importQueue(){
  setBusy(true);setMessage("Importing queued vouchers…");
  let imported=0,duplicates=0,needsMapping=0;
  try{
   for(;;){
    const response=await companyFetch("/api/integrations/tally/bridge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"import_queue",confirmation:"IMPORT TALLY"})});
    const body=await response.json();if(!response.ok)throw Error(body.message);
    imported+=body.imported;duplicates+=body.duplicates;needsMapping+=body.needsMapping;
    setMessage(`Imported ${imported} so far · ${body.remaining} left in the queue…`);
    if(body.remaining===0)break;
   }
   setMessage(`${imported} voucher${imported===1?"":"s"} imported, ${duplicates} already up to date, ${needsMapping} need manual review (use "Review voucher" below).`);
  }catch(e){setMessage(e instanceof Error?e.message:"Import failed.");}
  await refresh();setBusy(false);
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
 {queued>0&&<div className="bridge-review"><p>{queued} voucher{queued===1?"":"s"} received from Tally and waiting to be posted to Business and Accounting.</p><button disabled={busy} onClick={importQueue}>Import all queued vouchers</button></div>}
 {!data.transfers.length&&<p>No transfers yet.</p>}{data.transfers.map(item=><article className="bridge-transfer" key={item.id}><div><strong>{item.direction==="in"?"From Tally":"To Tally"} · {item.label}</strong><p>{item.status==="uncertain"?"Delivery uncertain":item.status}{item.message?` · ${item.message}`:""}</p></div>{item.direction==="in"&&(item.status==="review"||item.status==="needs_mapping")&&<button disabled={busy} onClick={()=>review(item)}>Review voucher</button>}{item.direction==="out"&&["sending","uncertain"].includes(item.status)&&<button disabled={busy} onClick={()=>act("reconcile",{transfer:item.id})}>Check delivery</button>}{item.status==="blocked"&&<button disabled={busy} onClick={()=>act("retry",{transfer:item.id})}>Retry after fixing</button>}</article>)}
 <DocumentHistory documents={data.documents||[]}/>
 </section>;
}
