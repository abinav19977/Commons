import { NextResponse } from "next/server";
import { parseXml,descendants,value } from "../../../../lib/tally-document";
import { getRawDb } from "../../../../../db";
import { authenticateBridge,digest,voucherBlocks,readBoundedJson,type Bridge } from "../../../../lib/tally-bridge";
import { resolveMasterLedgerCode } from "../../../../lib/tally";
const reply=(message:string,status=400)=>NextResponse.json({message},{status});
// Shared by the single-voucher "inbox" action and the bulk "inbox_batch" action used
// for one-time historical catch-up, so both paths dedupe/revision-check identically.
async function receiveVoucher(raw:ReturnType<typeof getRawDb>,bridge:Bridge,xml:unknown):Promise<string>{
 if(typeof xml!=="string"||new TextEncoder().encode(xml).length>400_000||/<!DOCTYPE|<!ENTITY/i.test(xml))return "invalid: Invalid voucher XML.";
 const blocks=voucherBlocks(xml);if(blocks.length!==1)return "invalid: Send one voucher at a time.";
 let node;try{const parsed=descendants(parseXml(xml),"VOUCHER");if(parsed.length!==1)throw Error("Expected one voucher.");node=parsed[0];}catch{return "invalid: Malformed voucher XML.";}
 const key=value(node,"GUID");if(!key||key.length>160)return "invalid: A stable Tally voucher GUID is required.";
 const own=await raw.prepare("SELECT id FROM journal_entries WHERE owner_user_id=? AND id=? AND source_type!='tally_import'").bind(bridge.owner_user_id,key).first();
 if(own)return "ignored";
 const hash=await digest(xml);
 const prior=await raw.prepare("SELECT id,digest FROM tally_transfers WHERE bridge_id=? AND direction='in' AND source_key=?").bind(bridge.id,key).first<{id:string;digest:string}>();
 if(prior){if(prior.digest!==hash)await raw.prepare("UPDATE tally_transfers SET xml=?,digest=?,status='review',message='Revised Tally voucher received. Review its linked business and accounting correction.',updated_at=? WHERE id=?").bind(xml,hash,Date.now(),prior.id).run();return "updated";}
 await raw.prepare("INSERT OR IGNORE INTO tally_transfers(id,owner_user_id,bridge_id,direction,source_key,label,xml,digest,status,created_at,updated_at) VALUES (?,?,?,'in',?,?,?,?,'review',?,?)").bind(crypto.randomUUID(),bridge.owner_user_id,bridge.id,key,value(node,"VOUCHERNUMBER")||key,xml,hash,Date.now(),Date.now()).run();
 return "created";
}
// Machine credentials are company-scoped, hashed, expiring and revocable.
// This endpoint only transports approved outgoing vouchers and an unposted inbox.
export async function POST(request:Request){
 const bridge=await authenticateBridge(request);if(!bridge)return reply("Connection key expired or revoked. Generate a new key in Commons.",401);
 // Batched historical catch-up can legitimately send up to 100 vouchers (each up to 64
 // KB) in one request; the default 100 KB body cap is sized for the other actions here.
 let body;try{body=await readBoundedJson(request,10_000_000);}catch(error){return reply(error instanceof Error?error.message:"Invalid request.",400);}
 if(typeof body.guid!=="string"||!body.guid||body.guid.length>160||body.name!==bridge.tally_name)return reply("The Tally company does not match this Commons connection.",409);
 const raw=getRawDb();
 if(bridge.tally_guid && bridge.tally_guid!==body.guid)return reply("Tally company identity changed. No data was transferred.",409);
 const binding=await raw.prepare("UPDATE tally_bridges SET tally_guid=?,last_seen=? WHERE id=? AND revoked=0 AND token_hash=? AND expires_at>? AND (tally_guid IS NULL OR tally_guid=?)").bind(body.guid,Date.now(),bridge.id,await digest(request.headers.get("authorization")!.slice(7)),Date.now(),body.guid).run();
 if(!binding.meta.changes)return reply("Company identity could not be verified.",409);
 if(body.action==="poll"){
  if(body.protocolVersion!==2)return reply("Update the Windows connector from Commons before sending vouchers. This version requires allocation-aware delivery checks.",426);
  const job=await raw.prepare("SELECT id,xml,digest,source_key,status FROM tally_transfers WHERE bridge_id=? AND direction='out' AND status IN ('pending','reconcile') ORDER BY created_at LIMIT 1").bind(bridge.id).first<{id:string;xml:string;digest:string;source_key:string;status:string}>();
  if(!job)return NextResponse.json({job:null});
  const claimed=await raw.prepare("UPDATE tally_transfers SET status='sending',updated_at=? WHERE id=? AND bridge_id=? AND status=?").bind(Date.now(),job.id,bridge.id,job.status).run();
  return NextResponse.json({job:claimed.meta.changes?{...job,checkOnly:job.status==="reconcile"}:null});
 }
 if(body.action==="ack"){
  if(typeof body.status!=="string"||!["sent","blocked","uncertain"].includes(body.status)||typeof body.id!=="string")return reply("Invalid delivery result.");
  await raw.prepare("UPDATE tally_transfers SET status=?,message=?,updated_at=? WHERE id=? AND bridge_id=? AND direction='out' AND status IN ('sending',?)").bind(body.status,String(body.message||"").slice(0,500),Date.now(),body.id,bridge.id,body.status).run();
  return NextResponse.json({ok:true});
 }
 if(body.action==="masters"){
  const ledgers=Array.isArray(body.ledgers)?body.ledgers:[];
  const stockItems=Array.isArray(body.stockItems)?body.stockItems:[];
  if(ledgers.length>5000||stockItems.length>5000)return reply("Too many master records in one request.");
  // Deliberately does not bulk-create customers/suppliers/products from the full Tally
  // master list: most Tally companies carry thousands of stale/inactive ledgers and stock
  // items that have never had a real transaction. Ledger/stock-item mapping always updates
  // here; the matching customer/supplier/product record is created lazily, one at a time,
  // only when an actual voucher needs it (see prepareConnectedImport in tally-connected-import.ts),
  // so the business view only ever shows parties/items with real activity.
  const now=Date.now();const statements=[];
  if(typeof body.booksFrom==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(body.booksFrom))statements.push(raw.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,'meta','books_from',?,?) ON CONFLICT(owner_user_id,kind,name) DO UPDATE SET top_group=excluded.top_group,updated_at=excluded.updated_at").bind(crypto.randomUUID(),bridge.owner_user_id,body.booksFrom,now));
  for(const l of ledgers){
   if(typeof l?.name!=="string"||!l.name.trim()||l.name.length>200)continue;
   const topGroup=typeof l.topGroup==="string"&&l.topGroup.trim()?l.topGroup.trim().slice(0,200):null;
   const money=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&Math.abs(v)<1e13?v:null;
   statements.push(raw.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,unit,gst_rate_basis_points,cost_paise,opening_paise,closing_paise,updated_at) VALUES (?,?,'ledger',?,?,NULL,NULL,NULL,?,?,?) ON CONFLICT(owner_user_id,kind,name) DO UPDATE SET top_group=excluded.top_group,opening_paise=COALESCE(excluded.opening_paise,tally_masters.opening_paise),closing_paise=COALESCE(excluded.closing_paise,tally_masters.closing_paise),updated_at=excluded.updated_at").bind(crypto.randomUUID(),bridge.owner_user_id,l.name.trim().slice(0,200),topGroup,money(l.openingPaise),money(l.closingPaise),now));
   // A balances-only update (no topGroup key) must not blank the group the earlier sync classified.
   if(!Object.hasOwn(l,"topGroup")){statements.pop();const basis=l.closingBasis==="asat"?"asat":"period";statements.push(raw.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,opening_paise,closing_paise,closing_basis,updated_at) VALUES (?,?,'ledger',?,NULL,?,?,?,?) ON CONFLICT(owner_user_id,kind,name) DO UPDATE SET opening_paise=COALESCE(excluded.opening_paise,tally_masters.opening_paise),closing_paise=COALESCE(excluded.closing_paise,tally_masters.closing_paise),closing_basis=CASE WHEN excluded.closing_paise IS NULL THEN tally_masters.closing_basis ELSE excluded.closing_basis END,updated_at=excluded.updated_at").bind(crypto.randomUUID(),bridge.owner_user_id,l.name.trim().slice(0,200),money(l.openingPaise),money(l.closingPaise),basis,now));}
  }
  for(const s of stockItems){
   if(typeof s?.name!=="string"||!s.name.trim()||s.name.length>200)continue;
   const unit=typeof s.unit==="string"&&s.unit.trim()?s.unit.trim().slice(0,20):null;
   const gst=typeof s.gstRateBasisPoints==="number"&&Number.isFinite(s.gstRateBasisPoints)?Math.max(0,Math.min(280000,Math.round(s.gstRateBasisPoints))):null;
   const cost=typeof s.costPaise==="number"&&Number.isFinite(s.costPaise)?Math.max(0,Math.round(s.costPaise)):null;
   statements.push(raw.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,unit,gst_rate_basis_points,cost_paise,updated_at) VALUES (?,?,'stockitem',?,NULL,?,?,?,?) ON CONFLICT(owner_user_id,kind,name) DO UPDATE SET unit=excluded.unit,gst_rate_basis_points=excluded.gst_rate_basis_points,cost_paise=excluded.cost_paise,updated_at=excluded.updated_at").bind(crypto.randomUUID(),bridge.owner_user_id,s.name.trim().slice(0,200),unit,gst,cost,now));
  }
  for(let i=0;i<statements.length;i+=100)await raw.batch(statements.slice(i,i+100));
  // Vouchers parked as "Map ledger X" become importable once X's group is known, so put them
  // back in the queue instead of waiting for someone to notice.
  const nowClassified=ledgers.filter((l:{name?:unknown;topGroup?:unknown})=>typeof l?.name==="string"&&l.name.trim()&&resolveMasterLedgerCode(l.name,typeof l.topGroup==="string"?l.topGroup:null)).map((l:{name:string})=>`Map ledger “${l.name.trim()}”`);
  let requeued=0;
  for(let i=0;i<nowClassified.length;i+=80){const part=nowClassified.slice(i,i+80);const done=await raw.prepare(`UPDATE tally_transfers SET status='review',message=NULL,updated_at=? WHERE owner_user_id=? AND direction='in' AND status='needs_mapping' AND message IN (${part.map(()=>"?").join(",")})`).bind(Date.now(),bridge.owner_user_id,...part).run();requeued+=Number(done.meta?.changes||0);}
  return NextResponse.json({ok:true,ledgers:ledgers.length,stockItems:stockItems.length,requeued});
 }
 if(body.action==="voucher_index"){
  // Completeness check: which of Tally's vouchers has Commons never received? Vouchers that
  // started in Commons and were sent to Tally are "own" and are not expected to come back.
  const items=Array.isArray(body.items)?body.items:[];
  if(items.length>500)return reply("Too many vouchers in one request.");
  const clean=items.filter((i:{guid?:unknown})=>typeof i?.guid==="string"&&i.guid.length>0&&i.guid.length<=160) as {guid:string;date?:unknown;type?:unknown;number?:unknown}[];
  const have=new Set<string>();
  for(let i=0;i<clean.length;i+=80){
   const part=clean.slice(i,i+80).map(x=>x.guid),ph=part.map(()=>"?").join(",");
   const [received,own]=await Promise.all([
    raw.prepare(`SELECT source_key k FROM tally_transfers WHERE bridge_id=? AND direction='in' AND source_key IN (${ph})`).bind(bridge.id,...part).all<{k:string}>(),
    raw.prepare(`SELECT id k FROM journal_entries WHERE owner_user_id=? AND source_type!='tally_import' AND id IN (${ph})`).bind(bridge.owner_user_id,...part).all<{k:string}>(),
   ]);
   for(const r of received.results)have.add(r.k);for(const r of own.results)have.add(r.k);
  }
  const missing=clean.filter(x=>!have.has(x.guid)).map(x=>({guid:x.guid,date:String(x.date||"").slice(0,8),type:String(x.type||"").slice(0,80),number:String(x.number||"").slice(0,60)}));
  return NextResponse.json({ok:true,checked:clean.length,missing});
 }
 if(body.action==="inbox"){
  const result=await receiveVoucher(raw,bridge,body.xml);
  if(result.startsWith("invalid: "))return reply(result.slice(9));
  return NextResponse.json({ok:true,ignored:result==="ignored"});
 }
 if(body.action==="inbox_batch"){
  // One-time historical catch-up sends hundreds/thousands of vouchers. Doing this the
  // same way as single "inbox" (2-3 sequential D1 queries per voucher) blows past
  // Cloudflare's per-request subrequest limit at even 100 vouchers, so this path reads
  // in two bulk queries and writes in a handful of raw.batch() calls instead.
  const items=Array.isArray(body.items)?body.items:[];
  if(!items.length||items.length>200)return reply("Send between 1 and 200 vouchers per batch.");
  const parsedItems:{xml:string;key:string;number:string}[]=[];
  let invalid=0;
  for(const xml of items){
   if(typeof xml!=="string"||new TextEncoder().encode(xml).length>400_000||/<!DOCTYPE|<!ENTITY/i.test(xml)){invalid++;continue;}
   if(voucherBlocks(xml).length!==1){invalid++;continue;}
   let node;try{const nodes=descendants(parseXml(xml),"VOUCHER");if(nodes.length!==1)throw Error();node=nodes[0];}catch{invalid++;continue;}
   const key=value(node,"GUID");if(!key||key.length>160){invalid++;continue;}
   parsedItems.push({xml,key,number:value(node,"VOUCHERNUMBER")||key});
  }
  if(!parsedItems.length)return NextResponse.json({ok:true,created:0,updated:0,ignored:0,invalid});
  const keys=parsedItems.map(p=>p.key);
  // D1 rejects any statement binding more than 100 values ("too many SQL variables"), and a
  // 100-voucher batch plus its owner/bridge id is 101 -- so look keys up in slices.
  const ownSet=new Set<string>(),priorByKey=new Map<string,{id:string;source_key:string;digest:string}>();
  for(let i=0;i<keys.length;i+=80){
   const slice=keys.slice(i,i+80),placeholders=slice.map(()=>"?").join(",");
   const [ownRows,priorRows]=await Promise.all([
    raw.prepare(`SELECT id FROM journal_entries WHERE owner_user_id=? AND source_type!='tally_import' AND id IN (${placeholders})`).bind(bridge.owner_user_id,...slice).all<{id:string}>(),
    raw.prepare(`SELECT id,source_key,digest FROM tally_transfers WHERE bridge_id=? AND direction='in' AND source_key IN (${placeholders})`).bind(bridge.id,...slice).all<{id:string;source_key:string;digest:string}>(),
   ]);
   for(const r of ownRows.results)ownSet.add(r.id);
   for(const r of priorRows.results)priorByKey.set(r.source_key,r);
  }
  const hashes=await Promise.all(parsedItems.map(p=>digest(p.xml)));
  // The same GUID can legitimately repeat within one batch (e.g. a voucher altered
  // twice in Tally before this sync ran). Collapse to each key's latest occurrence for
  // the actual write, but still count status per occurrence, matching what N separate
  // single "inbox" calls would have reported.
  const now=Date.now();let created=0,updated=0,ignored=0;
  const latestByKey=new Map<string,{xml:string;number:string;hash:string}>();
  const occurrences=new Map<string,number>();
  for(let i=0;i<parsedItems.length;i++){
   const p=parsedItems[i];
   if(ownSet.has(p.key)){ignored++;continue;}
   latestByKey.set(p.key,{xml:p.xml,number:p.number,hash:hashes[i]});
   occurrences.set(p.key,(occurrences.get(p.key)||0)+1);
  }
  const statements=[];
  for(const [key,latest] of latestByKey){
   const count=occurrences.get(key)||1;
   const prior=priorByKey.get(key);
   if(prior){
    if(prior.digest!==latest.hash)statements.push(raw.prepare("UPDATE tally_transfers SET xml=?,digest=?,status='review',message='Revised Tally voucher received. Review its linked business and accounting correction.',updated_at=? WHERE id=?").bind(latest.xml,latest.hash,now,prior.id));
    updated+=count;
   }else{
    statements.push(raw.prepare("INSERT OR IGNORE INTO tally_transfers(id,owner_user_id,bridge_id,direction,source_key,label,xml,digest,status,created_at,updated_at) VALUES (?,?,?,'in',?,?,?,?,'review',?,?)").bind(crypto.randomUUID(),bridge.owner_user_id,bridge.id,key,latest.number,latest.xml,latest.hash,now,now));
    created+=1;updated+=count-1;
   }
  }
  for(let i=0;i<statements.length;i+=50)await raw.batch(statements.slice(i,i+50));
  return NextResponse.json({ok:true,created,updated,ignored,invalid});
 }
 return reply("Unknown connector action.");
}
