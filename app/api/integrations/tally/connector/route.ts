import { NextResponse } from "next/server";
import { parseXml,descendants,value } from "../../../../lib/tally-document";
import { getRawDb } from "../../../../../db";
import { authenticateBridge,digest,voucherBlocks,readBoundedJson } from "../../../../lib/tally-bridge";
const reply=(message:string,status=400)=>NextResponse.json({message},{status});
// Machine credentials are company-scoped, hashed, expiring and revocable.
// This endpoint only transports approved outgoing vouchers and an unposted inbox.
export async function POST(request:Request){
 const bridge=await authenticateBridge(request);if(!bridge)return reply("Connection key expired or revoked. Generate a new key in Commons.",401);
 let body;try{body=await readBoundedJson(request);}catch(error){return reply(error instanceof Error?error.message:"Invalid request.",400);}
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
 if(body.action==="inbox"){
  if(typeof body.xml!=="string"||new TextEncoder().encode(body.xml).length>64000||/<!DOCTYPE|<!ENTITY/i.test(body.xml))return reply("Invalid voucher XML.");
  const blocks=voucherBlocks(body.xml);if(blocks.length!==1)return reply("Send one voucher at a time.");
  let node;try{const parsed=descendants(parseXml(body.xml),"VOUCHER");if(parsed.length!==1)throw Error("Expected one voucher.");node=parsed[0];}catch{return reply("Malformed voucher XML.");}
  const key=value(node,"GUID");if(!key||key.length>160)return reply("A stable Tally voucher GUID is required.");
  // Do not echo Commons entries back into its books.
  const own=await raw.prepare("SELECT id FROM journal_entries WHERE owner_user_id=? AND id=? AND source_type!='tally_import'").bind(bridge.owner_user_id,key).first();
  if(own)return NextResponse.json({ok:true,ignored:true});
  const hash=await digest(body.xml);
  const prior=await raw.prepare("SELECT id,digest FROM tally_transfers WHERE bridge_id=? AND direction='in' AND source_key=?").bind(bridge.id,key).first<{id:string;digest:string}>();
  if(prior){if(prior.digest!==hash)await raw.prepare("UPDATE tally_transfers SET xml=?,digest=?,status='review',message='Revised Tally voucher received. Review its linked business and accounting correction.',updated_at=? WHERE id=?").bind(body.xml,hash,Date.now(),prior.id).run();return NextResponse.json({ok:true});}
  await raw.prepare("INSERT OR IGNORE INTO tally_transfers(id,owner_user_id,bridge_id,direction,source_key,label,xml,digest,status,created_at,updated_at) VALUES (?,?,?,'in',?,?,?,?,'review',?,?)").bind(crypto.randomUUID(),bridge.owner_user_id,bridge.id,key,value(node,"VOUCHERNUMBER")||key,body.xml,hash,Date.now(),Date.now()).run();
  return NextResponse.json({ok:true});
 }
 return reply("Unknown connector action.");
}
