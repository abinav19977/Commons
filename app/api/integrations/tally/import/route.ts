import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../../db";
import { getChatGPTUser } from "../../../../company-auth";
import { prepareConnectedImport } from "../../../../lib/tally-connected-import";
import { parseXml, descendants, value, tallyDate } from "../../../../lib/tally-document";
import { voucherBlocks, readBoundedJson } from "../../../../lib/tally-bridge";

const schema=z.object({action:z.enum(["preview","commit"]),xml:z.string().min(20).max(4_000_000),confirmation:z.string().optional(),mappings:z.record(z.string().max(160),z.string().regex(/^\d{4}$/)).optional().default({})});
export async function POST(request:Request){
 const user=await getChatGPTUser(request);if(!user)return NextResponse.json({message:"Select your company and sign in again."},{status:401});
 const data=schema.safeParse(await readBoundedJson(request,4_200_000).catch(()=>null));if(!data.success)return NextResponse.json({message:"Choose valid voucher XML under 4 MB."},{status:400});
 let structuralCount=0;try{structuralCount=descendants(parseXml(data.data.xml),"VOUCHER").length;}catch{return NextResponse.json({message:"The complete XML document is malformed. No records were imported."},{status:400});}
 const blocks=voucherBlocks(data.data.xml);if(structuralCount!==blocks.length)return NextResponse.json({message:"Unsupported voucher XML structure."},{status:400});if(!blocks.length||blocks.length>50)return NextResponse.json({message:"Review between 1 and 50 vouchers at a time. No records were imported."},{status:400});
 if(data.data.action==="commit"&&data.data.confirmation!=="IMPORT TALLY")return NextResponse.json({message:"Review and confirm the import first."},{status:400});
 const mappings=Object.fromEntries(Object.entries(data.data.mappings).map(([name,code])=>[name.toLowerCase().trim(),code]));
 const previews=[];let imported=0;
 for(const block of blocks){
  try{
   const result=await prepareConnectedImport(user.id,user.email,block,mappings);
   previews.push({key:result.doc.guid,date:result.doc.date,type:result.doc.type,number:result.doc.number,narration:result.effects.join(" · "),amountPaise:result.doc.ledgers.reduce((sum,l)=>sum+Math.max(0,-l.amount),0),status:result.duplicate?"duplicate":result.issues.length?"needs_mapping":"ready",issues:result.issues});
   if(data.data.action==="commit"&&!result.duplicate&&!result.issues.length){await getRawDb().batch(result.statements);imported++;}
  }catch(error){
   const node=descendants(parseXml(block),"VOUCHER")[0];
   previews.push({key:"error-"+previews.length,date:tallyDate(value(node,"DATE")),type:value(node,"VOUCHERTYPENAME"),number:value(node,"VOUCHERNUMBER")||"Unprocessed voucher",narration:value(node,"NARRATION"),amountPaise:0,status:"needs_mapping",issues:[error instanceof Error?error.message:"Voucher could not be processed."]});

  }
 }
 if(data.data.action==="preview")return NextResponse.json({total:previews.length,ready:previews.filter(v=>v.status==="ready").length,needsMapping:previews.filter(v=>v.status==="needs_mapping").length,duplicates:previews.filter(v=>v.status==="duplicate").length,vouchers:previews});
 return NextResponse.json({imported,message:`${imported} vouchers synchronised with Business and Accounting. ${previews.filter(v=>v.status==="needs_mapping").length} need review.`,vouchers:previews});
}
