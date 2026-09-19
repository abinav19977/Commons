import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../company-auth";
import { getRawDb } from "../../../../../db";
import { digest,voucherBlocks,xmlTag, type Bridge,readBoundedJson } from "../../../../lib/tally-bridge";
import { parseXml,descendants,accountingLedgerNodes,value,scaled } from "../../../../lib/tally-document";
import { tallyEnvelope } from "../../../../lib/tally";
import { prepareConnectedImport } from "../../../../lib/tally-connected-import";
import { GET as exportXml } from "../export/route";
// The connector can deliver hundreds of historical vouchers into the queue in minutes
// (see inbox_batch), but each one otherwise needs a manual "Review voucher" click here.
// This commits everything in the queue that's already clean, in modest batches so a
// single request stays inside the Worker's CPU/subrequest budget.
const IMPORT_QUEUE_BATCH = 25;
const reply=(message:string,status=400)=>NextResponse.json({message},{status});
export async function GET(request:Request){
 const user=await getChatGPTUser(request);if(!user)return reply("Select your company and sign in again.",401);
 const raw=getRawDb();const bridge=await raw.prepare("SELECT id,tally_name,tally_guid,last_seen,revoked,expires_at FROM tally_bridges WHERE owner_user_id=?").bind(user.id).first();
 const id=new URL(request.url).searchParams.get("inbox");
 const documentId=new URL(request.url).searchParams.get("document");
 if(documentId){const document=await raw.prepare("SELECT payload FROM tally_documents WHERE id=? AND owner_user_id=?").bind(documentId,user.id).first<{payload:string}>();return document?NextResponse.json({document:JSON.parse(document.payload)}):reply("Document not found.",404);}
 if(id){const item=await raw.prepare("SELECT xml FROM tally_transfers WHERE id=? AND owner_user_id=? AND direction='in'").bind(id,user.id).first<{xml:string}>();return item?NextResponse.json(item):reply("Transfer not found.",404);}
 const transfers=await raw.prepare("SELECT id,direction,label,status,message,updated_at FROM tally_transfers WHERE owner_user_id=? ORDER BY updated_at DESC LIMIT 100").bind(user.id).all();
 const documents=await raw.prepare("SELECT id,guid,kind,revision,created_at FROM tally_documents WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 50").bind(user.id).all();
 const queued=await raw.prepare("SELECT COUNT(*) c FROM tally_transfers WHERE owner_user_id=? AND direction='in' AND status='review'").bind(user.id).first<{c:number}>();
 return NextResponse.json({bridge,transfers:transfers.results,documents:documents.results,queued:queued?.c||0});
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
