import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../company-auth";
import { getRawDb } from "../../../../../db";
import { digest,voucherBlocks,xmlTag, type Bridge,readBoundedJson } from "../../../../lib/tally-bridge";
import { parseXml,descendants,accountingLedgerNodes,value,scaled } from "../../../../lib/tally-document";
import { tallyEnvelope } from "../../../../lib/tally";
import { GET as exportXml } from "../export/route";
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
 return NextResponse.json({bridge,transfers:transfers.results,documents:documents.results});
}
export async function POST(request:Request){
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
  await raw.prepare("UPDATE tally_transfers SET status='pending',message=NULL,updated_at=? WHERE id=? AND owner_user_id=? AND direction='out' AND status='blocked'").bind(Date.now(),String(body.transfer||""),user.id).run();return reply("Blocked transfer queued for another attempt.",200);
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
 if(body.action==="preview")return NextResponse.json({vouchers:candidates.map(({xml,...v})=>v)});
 if(body.confirmation!=="SEND TO TALLY"||!Array.isArray(body.reviewed))return reply("Review the vouchers before approving the transfer.");
 const reviewed=body.reviewed;
 const selected=candidates.filter(c=>reviewed.some(r=>r&&typeof r==="object"&&r.key===c.key&&r.digest===c.digest));
 if(selected.length!==body.reviewed.length || !selected.length)return reply("The vouchers changed or were already queued. Preview again.",409);
 await raw.batch(selected.map(v=>raw.prepare("INSERT OR IGNORE INTO tally_transfers(id,owner_user_id,bridge_id,direction,source_key,label,xml,digest,status,created_at,updated_at) VALUES (?,?,?,'out',?,?,?,?,'pending',?,?)").bind(crypto.randomUUID(),user.id,bridge.id,v.key,v.label,v.xml,v.digest,Date.now(),Date.now())));
 return reply(`${selected.length} approved vouchers queued. Keep the connector and TallyPrime open.`,200);
}
