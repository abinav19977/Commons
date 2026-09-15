import { getRawDb } from "../../db";
export type Bridge={id:string;owner_user_id:string;tally_name:string;tally_guid:string|null;last_seen:number|null;revoked:number;expires_at:number};
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");}
export async function authenticateBridge(request:Request):Promise<Bridge|null>{
 const token=request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)return null;
 return getRawDb().prepare("SELECT id,owner_user_id,tally_name,tally_guid,last_seen,revoked,expires_at FROM tally_bridges WHERE token_hash=? AND revoked=0 AND expires_at>?").bind(await digest(token),Date.now()).first<Bridge>();
}
export function xmlTag(xml:string,name:string){return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,"i"))?.[1]?.trim()||"";}
export function voucherBlocks(xml:string){return [...xml.matchAll(/<VOUCHER(?:\s[^>]*)?>[\s\S]*?<\/VOUCHER>/gi)].map(m=>m[0]);}

export async function readBoundedJson(request:Request,maxBytes=100000):Promise<Record<string,unknown>>{
 if(Number(request.headers.get("content-length"))>maxBytes)throw Error("Transfer exceeds its size limit.");
 const reader=request.body?.getReader();if(!reader)throw Error("Missing request body.");
 const decoder=new TextDecoder("utf-8",{fatal:true});let bytes=0,text="";
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error("Transfer exceeds its size limit.");}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=JSON.parse(text);if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Expected a JSON object.");return body;
}
