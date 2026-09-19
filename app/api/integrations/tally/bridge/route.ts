import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../company-auth";
import { getRawDb } from "../../../../../db";
import { digest,voucherBlocks,xmlTag, type Bridge,readBoundedJson } from "../../../../lib/tally-bridge";
import { parseXml,descendants,accountingLedgerNodes,value,scaled } from "../../../../lib/tally-document";
import { tallyEnvelope } from "../../../../lib/tally";
import { CORE_ACCOUNTS } from "../../../../lib/accounting";
import { assertPeriodOpen,prepareJournal } from "../../../../lib/book-server";
import { resolveMasterLedgerCode,TALLY_LEDGER_MAP } from "../../../../lib/tally";
import { deriveOpenings,isProfitAndLoss,openingEntry,reconcileLedgers,type MasterLedger,type Window } from "../../../../lib/tally-reconcile";
import { todayIST } from "../../../../lib/date";
import { prepareConnectedImport } from "../../../../lib/tally-connected-import";
import { GET as exportXml } from "../export/route";
// The connector can deliver hundreds of historical vouchers into the queue in minutes
// (see inbox_batch), but each one otherwise needs a manual "Review voucher" click here.
// This commits everything in the queue that's already clean, in modest batches so a
// single request stays inside the Worker's CPU/subrequest budget.
const IMPORT_QUEUE_BATCH = 25;
const reply=(message:string,status=400)=>NextResponse.json({message},{status});
// What each Tally ledger moved by in the vouchers Commons has imported (latest revision of each,
// cancelled ones excluded). Only the ledgers array is pulled out of each stored document in SQL,
// because the full payload carries the raw voucher XML.
async function movedByLedger(raw:ReturnType<typeof getRawDb>,owner:string){
 const docs=await raw.prepare("SELECT json_extract(d.payload,'$.ledgers') l,json_extract(d.payload,'$.date') dt FROM tally_documents d WHERE d.owner_user_id=? AND d.rowid=(SELECT MAX(x.rowid) FROM tally_documents x WHERE x.owner_user_id=d.owner_user_id AND x.guid=d.guid) AND COALESCE(json_extract(d.payload,'$.cancelled'),0)=0").bind(owner).all<{l:string|null;dt:string|null}>();
 const moved:{name:string;amount:number;date?:string}[]=[];
 for(const d of docs.results){try{for(const l of JSON.parse(d.l||"[]") as {name:string;amount:number}[])moved.push({name:l.name,amount:l.amount,date:d.dt||undefined});}catch{}}
 return {moved,vouchers:docs.results.length};
}
type MasterRow={name:string;top_group:string|null;opening_paise:number|null;closing_paise:number|null;closing_basis:string|null};
const fiscalStartOf=(d:string)=>`${Number(d.slice(5,7))>=4?d.slice(0,4):Number(d.slice(0,4))-1}-04-01`;
async function loadBalances(raw:ReturnType<typeof getRawDb>,owner:string){
 const masters=await raw.prepare("SELECT name,top_group,opening_paise,closing_paise,closing_basis FROM tally_masters WHERE owner_user_id=? AND kind='ledger'").bind(owner).all<MasterRow>();
 const meta=await raw.prepare("SELECT top_group d FROM tally_masters WHERE owner_user_id=? AND kind='meta' AND name='books_from'").bind(owner).first<{d:string}>();
 const saved=await raw.prepare("SELECT name,top_group code FROM tally_masters WHERE owner_user_id=? AND kind='mapping'").bind(owner).all<{name:string;code:string}>();
 const ledgers:MasterLedger[]=masters.results.map(r=>({name:r.name,group:r.top_group,opening:r.opening_paise,closing:r.closing_paise,basis:r.closing_basis==="asat"?"asat":"period"}));
 const savedMap=new Map(saved.results.map(r=>[r.name.toLowerCase().trim(),r.code]));
 // Income and expense ledgers are recognised by their Tally group or, failing that, by the Commons account they map to.
 const window:Window={fyStart:fiscalStartOf(todayIST()),isProfitAndLoss:(name,group)=>{if(isProfitAndLoss(group))return true;const key=name.toLowerCase().trim();const code=savedMap.get(key)||resolveMasterLedgerCode(name,group)||TALLY_LEDGER_MAP[key]?.code;return !!code&&/^[456]/.test(code);}};
 return {ledgers,booksFrom:meta?.d||null,saved:savedMap,window};
}

export async function GET(request:Request){
 const user=await getChatGPTUser(request);if(!user)return reply("Select your company and sign in again.",401);
 const raw=getRawDb();const bridge=await raw.prepare("SELECT id,tally_name,tally_guid,last_seen,revoked,expires_at FROM tally_bridges WHERE owner_user_id=?").bind(user.id).first();
 if(new URL(request.url).searchParams.get("reconcile")){
  const {ledgers,booksFrom,window}=await loadBalances(raw,user.id);
  const withBalances=ledgers.filter(l=>l.closing!==null);
  const {moved,vouchers}=await movedByLedger(raw,user.id);
  const posted=await raw.prepare("SELECT id FROM journal_entries WHERE owner_user_id=? AND source_type='tally_opening' AND status='posted' ORDER BY created_at DESC LIMIT 1").bind(user.id).first();
  // Opening = Tally's closing minus what the imported vouchers moved (see deriveOpenings).
  const derived=deriveOpenings(ledgers,moved,window);
  const result=reconcileLedgers(derived.masters,moved,!!posted,window);
  const opening=openingEntry(derived.masters,()=>({code:"3100",name:"Opening balance equity"}));
  return NextResponse.json({booksFrom,hasBalances:withBalances.length,openingsPosted:!!posted,openingLedgers:opening.ledgers,checked:result.checked,matched:result.matched,differing:result.differing,totalAbsDifference:result.totalAbsDifference,rows:result.rows.slice(0,40),vouchers,unexplained:derived.unexplained.slice(0,15),unexplainedCount:derived.unexplained.length,unexplainedTotal:derived.unexplainedTotal});
 }
 const id=new URL(request.url).searchParams.get("inbox");
 const documentId=new URL(request.url).searchParams.get("document");
 if(documentId){const document=await raw.prepare("SELECT payload FROM tally_documents WHERE id=? AND owner_user_id=?").bind(documentId,user.id).first<{payload:string}>();return document?NextResponse.json({document:JSON.parse(document.payload)}):reply("Document not found.",404);}
 if(id){const item=await raw.prepare("SELECT xml FROM tally_transfers WHERE id=? AND owner_user_id=? AND direction='in'").bind(id,user.id).first<{xml:string}>();return item?NextResponse.json(item):reply("Transfer not found.",404);}
 const transfers=await raw.prepare("SELECT id,direction,label,status,message,updated_at FROM tally_transfers WHERE owner_user_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
 const documents=await raw.prepare("SELECT id,guid,kind,revision,created_at FROM tally_documents WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
 const queued=await raw.prepare("SELECT COUNT(*) c FROM tally_transfers WHERE owner_user_id=? AND direction='in' AND status='review'").bind(user.id).first<{c:number}>();
 // Ledgers holding vouchers back only because Commons doesn't know their account type, with how many each blocks.
 const blocked=await raw.prepare("SELECT message,COUNT(*) n FROM tally_transfers WHERE owner_user_id=? AND direction='in' AND status='needs_mapping' AND message LIKE 'Map ledger %' GROUP BY message ORDER BY n DESC LIMIT 120").bind(user.id).all<{message:string;n:number}>();
 const unmapped=blocked.results.map(r=>({name:(r.message.match(/^Map ledger “(.+)”$/)||[])[1]||"",count:r.n})).filter(r=>r.name);
 return NextResponse.json({bridge,transfers:transfers.results,documents:documents.results,queued:queued?.c||0,unmapped});
}
async function handlePost(request:Request){
 const user=await getChatGPTUser(request);if(!user)return reply("Your company selection changed. Reload this page.",401);
 const body=await readBoundedJson(request).catch(()=>null);if(!body)return reply("Invalid request.");
 const raw=getRawDb();const bridge=await raw.prepare("SELECT * FROM tally_bridges WHERE owner_user_id=?").bind(user.id).first<Bridge>();
 if(body.action==="pair"){
  const name=typeof body.name==="string"?body.name.trim():"";if(!name||name.length>160)return reply("Enter the exact company name shown in TallyPrime.");
  if(bridge && bridge.tally_name!==name)return reply("This connection is locked to its original Tally company. Use a separate Commons company for a different Tally company.",409);
  const token=crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");
  await raw.prepare("INSERT INTO tally_bridges(id,owner_user_id,tally_name,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked=0").bind(crypto.randomUUID(),user.id,name,await digest(token),Date.now()+90*86400000,Date.now()).run();
  return NextResponse.json({token,message:"Paste this key in the Windows connector. It expires in 90 days; keep it private."});
 }
 if(!bridge)return reply("Create a connection first.",409);
 if(body.action==="revoke"){await raw.prepare("UPDATE tally_bridges SET revoked=1 WHERE owner_user_id=?").bind(user.id).run();return reply("Connector disconnected.",200);}
 if(body.action==="reconcile"){
  await raw.prepare("UPDATE tally_transfers SET status='reconcile',updated_at=? WHERE id=? AND owner_user_id=? AND direction='out' AND status IN ('sending','uncertain')").bind(Date.now(),String(body.transfer||""),user.id).run();return reply("Delivery check queued. The connector will check Tally without posting again.",200);
 }
 if(body.action==="retry"){
  // A blocked voucher was never posted, so drop it and let "Review outgoing vouchers" rebuild it:
  // resending the stored XML would repeat the same ledger names that got it blocked.
  await raw.prepare("DELETE FROM tally_transfers WHERE id=? AND owner_user_id=? AND direction='out' AND status='blocked'").bind(String(body.transfer||""),user.id).run();return reply("Cleared. Choose the date range and review outgoing vouchers again to resend it with your current Tally ledger names.",200);
 }

 if(body.action==="map_ledgers"){
  const allowed=new Set<string>(CORE_ACCOUNTS.map(a=>a.code));
  const entries=Object.entries(body.mappings&&typeof body.mappings==="object"?body.mappings as Record<string,unknown>:{}).filter(([name,code])=>name.trim()&&name.length<=200&&typeof code==="string"&&allowed.has(code)).slice(0,120);
  if(!entries.length)return reply("Choose an account for at least one ledger.");
  const now=Date.now();
  await raw.batch(entries.map(([name,code])=>raw.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,'mapping',?,?,?) ON CONFLICT(owner_user_id,kind,name) DO UPDATE SET top_group=excluded.top_group,updated_at=excluded.updated_at").bind(crypto.randomUUID(),user.id,name.trim(),code,now)));
  // Put the vouchers that were waiting on exactly these ledgers back in the import queue.
  const messages=entries.map(([name])=>`Map ledger “${name.trim()}”`);
  for(let i=0;i<messages.length;i+=80){const part=messages.slice(i,i+80);await raw.prepare(`UPDATE tally_transfers SET status='review',message=NULL,updated_at=? WHERE owner_user_id=? AND direction='in' AND status='needs_mapping' AND message IN (${part.map(()=>"?").join(",")})`).bind(Date.now(),user.id,...part).run();}
  return NextResponse.json({message:`${entries.length} ledger${entries.length===1?"":"s"} mapped. Their vouchers are back in the import queue.`});
 }

 if(body.action==="post_openings"){
  if(body.confirmation!=="POST TALLY OPENINGS")return reply("Confirm the opening balances first.");
  const loaded=await loadBalances(raw,user.id);
  const {booksFrom,saved,window}=loaded;
  if(!booksFrom||!loaded.ledgers.some(l=>l.closing!==null))return reply("Tally's balances have not arrived yet. In the connector click Read Tally balances, wait for it to finish, then try again.",409);
  const derived=deriveOpenings(loaded.ledgers,(await movedByLedger(raw,user.id)).moved,window);
  const ledgers=derived.masters;
  const customers=await raw.prepare("SELECT id,display_name name FROM customers WHERE owner_user_id=?").bind(user.id).all<{id:string;name:string}>();
  const suppliers=await raw.prepare("SELECT id,name FROM suppliers WHERE owner_user_id=?").bind(user.id).all<{id:string;name:string}>();
  const partyIds=new Map<string,string>();
  const partyStatements=[];
  for(const l of ledgers){
   const g=(l.group||"").toLowerCase();if(!l.opening||(g!=="sundry debtors"&&g!=="sundry creditors"))continue;
   const customer=g==="sundry debtors",list=customer?customers.results:suppliers.results,found=list.find(r=>r.name===l.name);
   const id=found?.id||"tp-"+(await digest(user.id+":"+(customer?"customer":"supplier")+":"+l.name)).slice(0,40);
   partyIds.set(l.name,id);
   if(!found)partyStatements.push(customer?raw.prepare("INSERT OR IGNORE INTO customers(id,owner_user_id,display_name,primary_phone,gst_registration_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id,user.id,l.name,"","unregistered",Date.now(),Date.now()):raw.prepare("INSERT OR IGNORE INTO suppliers(id,owner_user_id,name,primary_phone,gst_registration_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id,user.id,l.name,"","unregistered",Date.now(),Date.now()));
  }
  const names=new Map<string,string>(CORE_ACCOUNTS.map(a=>[a.code,a.name]));
  const plan=openingEntry(ledgers,(name,group)=>{
   const key=name.toLowerCase().trim(),g=(group||"").toLowerCase();
   if(g==="sundry debtors")return {code:"1100",name:"Customer money due",party:{type:"customer" as const,id:partyIds.get(name)||"",name}};
   if(g==="sundry creditors")return {code:"2000",name:"Supplier money due",party:{type:"supplier" as const,id:partyIds.get(name)||"",name}};
   const custom=saved.get(key);
   const code=(custom&&names.has(custom)?custom:undefined)||resolveMasterLedgerCode(name,group)||TALLY_LEDGER_MAP[key]?.code;
   return code&&names.has(code)?{code,name:names.get(code)!}:undefined;
  });
  const fingerprint=(await digest(JSON.stringify(plan.lines))).slice(0,16),sourceId="tally-opening:"+fingerprint;
  const newest=await raw.prepare("SELECT id,source_id FROM journal_entries WHERE owner_user_id=? AND source_type='tally_opening' AND status='posted' ORDER BY created_at DESC LIMIT 1").bind(user.id).first<{id:string;source_id:string}>();
  if(newest?.source_id===sourceId)return NextResponse.json({message:"Tally's opening balances are already posted and unchanged.",already:true});
  try{await assertPeriodOpen(user.id,booksFrom);}catch{return reply("The period the books start in is locked, so opening balances cannot be posted.",409);}
  const statements=[...partyStatements];
  if(newest){
   const old=await raw.prepare("SELECT account_code,account_name,debit_paise,credit_paise,party_type,party_id,party_name FROM journal_lines WHERE owner_user_id=? AND entry_id=?").bind(user.id,newest.id).all<{account_code:string;account_name:string;debit_paise:number;credit_paise:number;party_type:string|null;party_id:string|null;party_name:string|null}>();
   const reversal=await prepareJournal({ownerUserId:user.id,actor:user.email,entryDate:booksFrom,sourceType:"tally_opening_reversal",sourceId:newest.id+":"+fingerprint,description:"Replaced by updated Tally opening balances",lines:old.results.map(l=>({accountCode:l.account_code,accountName:l.account_name,debitPaise:l.credit_paise,creditPaise:l.debit_paise,...(l.party_id?{partyType:l.party_type as "customer"|"supplier",partyId:l.party_id,partyName:l.party_name||""}:{})}))});
   statements.push(...reversal.statements);
  }
  const journal=await prepareJournal({ownerUserId:user.id,actor:user.email,entryDate:booksFrom,sourceType:"tally_opening",sourceId,description:"Opening balances from Tally",lines:plan.lines});
  statements.push(...journal.statements);
  for(let i=0;i<statements.length;i+=100)await raw.batch(statements.slice(i,i+100));
  return NextResponse.json({message:`Opening balances from Tally posted for ${plan.ledgers} ledgers, dated ${booksFrom}.${plan.unmapped.length?` ${plan.unmapped.length} had no account and went to Opening balance equity.`:""}${derived.unexplained.length?` ${derived.unexplained.length} income or expense ledger${derived.unexplained.length===1?"":"s"} carried a balance that did not come from vouchers (usually an opening balance entered directly on the ledger in Tally), so it is included in the opening.`:""}`,ledgers:plan.ledgers,unmapped:plan.unmapped.slice(0,20),balancingPaise:plan.balancingPaise,unexplained:derived.unexplained.slice(0,15)});
 }
 if(body.action==="import_queue"){
  if(body.confirmation!=="IMPORT TALLY")return reply("Confirm the import first.");
  const pending=await raw.prepare("SELECT id,xml FROM tally_transfers WHERE owner_user_id=? AND direction='in' AND status='review' ORDER BY created_at LIMIT ?").bind(user.id,IMPORT_QUEUE_BATCH).all<{id:string;xml:string}>();
  const statements=[];let imported=0,duplicates=0,needsMapping=0;const problems:string[]=[];
  const hold=(transferId:string,issue:string)=>{needsMapping++;problems.push(issue);
   // Move it out of 'review' so the next batch call skips it instead of reselecting the
   // same stuck voucher forever; "Review voucher" still opens it via its transfer id.
   statements.push(raw.prepare("UPDATE tally_transfers SET status='needs_mapping',message=?,updated_at=? WHERE id=? AND owner_user_id=?").bind(issue.slice(0,300),Date.now(),transferId,user.id));};
  for(const transfer of pending.results){
   try{
    const result=await prepareConnectedImport(user.id,user.email,transfer.xml,{});
    if(result.duplicate){duplicates++;statements.push(raw.prepare("UPDATE tally_transfers SET status='imported',updated_at=? WHERE id=? AND owner_user_id=?").bind(Date.now(),transfer.id,user.id));}
    else if(result.issues.length)hold(transfer.id,result.issues[0]);
    // Each voucher is saved on its own (not one big batch): a failure then holds back only
    // that voucher, and later vouchers see the customers/numbers the earlier ones created.
    else{await raw.batch(result.statements);imported++;}
   }catch(error){hold(transfer.id,error instanceof Error?error.message:"A queued voucher could not be processed.");}
  }
  if(statements.length)await raw.batch(statements);
  const remaining=await raw.prepare("SELECT COUNT(*) c FROM tally_transfers WHERE owner_user_id=? AND direction='in' AND status='review'").bind(user.id).first<{c:number}>();
  return NextResponse.json({imported,duplicates,needsMapping,remaining:remaining?.c||0,problems:problems.slice(0,5),message:`${imported} voucher${imported===1?"":"s"} imported, ${duplicates} already up to date, ${needsMapping} need review. ${remaining?.c||0} left in the queue.`});
 }
 if(typeof body.action!=="string"||!["preview","queue"].includes(body.action))return reply("Unknown action.");
 if(bridge.revoked||bridge.expires_at<=Date.now()||!bridge.tally_guid)return reply("Connect the Windows app and verify your Tally company first.",409);
 const url=new URL(request.url);url.pathname="/api/integrations/tally/export";url.search=new URLSearchParams({scope:"vouchers",from:String(body.from||""),to:String(body.to||"")}).toString();
 const response=await exportXml(new Request(url,{headers:request.headers}));if(!response.ok)return response;
 const blocks=voucherBlocks(await response.text());if(blocks.length>100)return reply("Choose a shorter date range: at most 100 vouchers per review.");
 const candidates=[];
 for(const block of blocks){const key=xmlTag(block,"GUID");if(!key)return reply("A voucher is missing its identifier.");
  const exists=await raw.prepare("SELECT id FROM tally_transfers WHERE bridge_id=? AND direction='out' AND source_key=?").bind(bridge.id,key).first();if(exists)continue;
  const xml=tallyEnvelope(bridge.tally_name,[`<TALLYMESSAGE>${block}</TALLYMESSAGE>`],"Vouchers");
  if(xml.length>64000)return reply("A voucher exceeds the connector limit. Use manual export for this voucher.");
  const node=descendants(parseXml(block),"VOUCHER")[0];const ledgers=accountingLedgerNodes(node);const party=ledgers.find(l=>value(l,"LEDGERNAME")===value(node,"PARTYLEDGERNAME"));
  const amountPaise=party?Math.abs(scaled(value(party,"AMOUNT"))):ledgers.reduce((sum,l)=>sum+Math.max(0,-scaled(value(l,"AMOUNT"))),0);
  candidates.push({key,label:xmlTag(block,"VOUCHERNUMBER"),date:xmlTag(block,"DATE"),amountPaise,digest:await digest(xml),xml});
 }
 if(body.action==="preview")return NextResponse.json({vouchers:candidates.map(v=>({key:v.key,label:v.label,date:v.date,amountPaise:v.amountPaise,digest:v.digest}))});
 if(body.confirmation!=="SEND TO TALLY"||!Array.isArray(body.reviewed))return reply("Review the vouchers before approving the transfer.");
 const reviewed=body.reviewed;
 const selected=candidates.filter(c=>reviewed.some(r=>r&&typeof r==="object"&&r.key===c.key&&r.digest===c.digest));
 if(selected.length!==body.reviewed.length || !selected.length)return reply("The vouchers changed or were already queued. Preview again.",409);
 await raw.batch(selected.map(v=>raw.prepare("INSERT OR IGNORE INTO tally_transfers(id,owner_user_id,bridge_id,direction,source_key,label,xml,digest,status,created_at,updated_at) VALUES (?,?,?,'out',?,?,?,?,'pending',?,?)").bind(crypto.randomUUID(),user.id,bridge.id,v.key,v.label,v.xml,v.digest,Date.now(),Date.now())));
 return reply(`${selected.length} approved vouchers queued. Keep the connector and TallyPrime open.`,200);
}

// An uncaught exception here otherwise surfaces as an empty 500, which the page can only
// show as "Unexpected end of JSON input". Return the reason instead.
export async function POST(request:Request){
 try{return await handlePost(request);}
 catch(error){console.error("Tally bridge action failed",error);return reply(error instanceof Error?"The request failed on the server: "+error.message.slice(0,240):"The request failed on the server.",500);}
}
