import {parseXml,descendants} from "./tally-document";
export function splitTallyUpload(xml:string){
 const tree=parseXml(xml,{bytes:30_000_000,nodes:1_000_000});
 const count=descendants(tree,"VOUCHER").length;
 const blocks=[...xml.matchAll(/<VOUCHER(?:\s[^>]*)?>[\s\S]*?<\/VOUCHER>/gi)].map(m=>m[0]);
 if(!count||count!==blocks.length||count>2000)throw Error("Choose a complete XML export with 1–2,000 vouchers.");
 const batches:string[]=[];let batch:string[]=[],bytes=21;
 for(const block of blocks){
  const size=new TextEncoder().encode(block).length;
  if(size>3_500_000)throw Error("One voucher exceeds 3.5 MB. Export that voucher separately for review.");
  if(batch.length>=10||bytes+size>3_500_000){batches.push("<ENVELOPE>"+batch.join("")+"</ENVELOPE>");batch=[];bytes=21;}
  batch.push(block);bytes+=size;
 }
 if(batch.length)batches.push("<ENVELOPE>"+batch.join("")+"</ENVELOPE>");
 return batches;
}
export function decodeTallyFile(bytes:ArrayBuffer){
 const b=new Uint8Array(bytes);
 return new TextDecoder(b[0]===255&&b[1]===254?"utf-16le":b[0]===254&&b[1]===255?"utf-16be":"utf-8",{fatal:true}).decode(b);
}
