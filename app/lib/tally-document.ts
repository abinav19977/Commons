export type XmlNode={name:string;text:string;attrs:Record<string,string>;children:XmlNode[]};
const decode=(text:string)=>text.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):Number(n))).replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&apos;","'").replaceAll("&amp;","&");
export function parseXml(xml:string, limits={bytes:4_000_000,nodes:100000}):XmlNode{
 if(new TextEncoder().encode(xml).length>limits.bytes||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error("Unsupported or oversized XML.");
 // Tally's historical control marker is not valid XML 1.0.
 xml=xml.replace(/&#(?:0*4|x0*4);/gi,"").replace(/\u0004/g,"");
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml))throw Error("Invalid XML control character.");
 const root:XmlNode={name:"ROOT",text:"",attrs:{},children:[]};const stack=[root];let count=0,offset=0;
 const tokens=/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g;
 for(const match of xml.matchAll(tokens)){
  if(match.index!==offset)throw Error("Malformed XML.");offset=match.index+match[0].length;
  const token=match[0];if(token.startsWith("<!--")||token.startsWith("<?"))continue;
  if(token.startsWith("<![CDATA[")){if(stack.length===1)throw Error("CDATA outside document.");stack.at(-1)!.text+=match[1];continue;}
  if(token.startsWith("</")){const close=token.match(/^<\/([\w.:-]+)\s*>$/);if(!close||stack.length<2||stack.pop()!.name!==close[1].toUpperCase())throw Error("Malformed XML nesting.");}
  else if(token.startsWith("<")){
   const opening=token.match(/^<([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/);if(!opening)throw Error("Malformed XML.");
   const node:XmlNode={name:opening[1].toUpperCase(),text:"",attrs:{},children:[]};let attrs=opening[2];
   while(attrs.trim()){
    const attr=attrs.match(/^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/);
    if(!attr||Object.hasOwn(node.attrs,attr[1].toUpperCase()))throw Error("Malformed or duplicate XML attribute.");
    node.attrs[attr[1].toUpperCase()]=decode(attr[2]??attr[3]);attrs=attrs.slice(attr[0].length);
   }
   stack.at(-1)!.children.push(node);if(!opening[3])stack.push(node);if(stack.length>40||++count>limits.nodes)throw Error("XML structure exceeds limits.");
  }else stack.at(-1)!.text+=decode(token);
 }
 if(offset!==xml.length||stack.length!==1||root.children.length!==1||root.text.trim())throw Error("Incomplete or malformed XML document.");return root;
}
export const children=(node:XmlNode,name:string)=>node.children.filter(n=>n.name===name);
export const value=(node:XmlNode,name:string)=>children(node,name)[0]?.text.trim()||"";
export function descendants(node:XmlNode,name:string):XmlNode[]{return node.children.flatMap(n=>[...(n.name===name?[n]:[]),...descendants(n,name)]);}
// Parse fixed-point values without binary floating-point rounding.
export function scaled(value:string,scale=100){
 if(!value.trim())throw Error("Required amount is missing. Check the ledger, item or bill allocation.");
 const clean=value.trim().replaceAll(",","");const m=clean.match(/^(-?)(\d+)(?:\.(\d+))?$/);
 if(!m)throw Error("Unsupported numeric or foreign-currency amount: "+value);
 const places=Math.log10(scale);if(!Number.isInteger(places))throw Error("Unsupported precision.");
 const fraction=m[3]||"";if(/[1-9]/.test(fraction.slice(places)))throw Error("Amount has unsupported decimal precision: "+value);
 const exact=(BigInt(m[2])*BigInt(scale)+BigInt(fraction.slice(0,places).padEnd(places,"0")||"0"))*(m[1]? BigInt(-1):BigInt(1));
 const number=Number(exact);if(!Number.isSafeInteger(number))throw Error("Amount exceeds supported precision.");return number;
}
export function tallyDate(text:string){if(!/^\d{8}$/.test(text))return "";const result=`${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`;const date=new Date(result+"T00:00:00Z");return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===result?result:"";}
// TallyPrime sometimes emits both an "ALL..." list and its plain-named counterpart for
// the same voucher, but the plain one can be an incomplete subset rather than a true
// duplicate (confirmed on a real GST sales voucher: LEDGERENTRIES.LIST omitted the sales
// ledger that ALLLEDGERENTRIES.LIST included, so counting both doubled every other line
// and silently dropped the sales one from the "seen twice" total). When the "ALL" list is
// present it is the complete, authoritative one — use it alone; fall back to the plain
// list only when "ALL" is absent entirely.
function preferAllList(nodes:XmlNode[],allName:string,plainName:string){
 const all=nodes.filter(n=>n.name===allName);
 return all.length?all:nodes.filter(n=>n.name===plainName);
}
export function inventoryEntryNodes(node:XmlNode){
 return [...preferAllList(node.children,"ALLINVENTORYENTRIES.LIST","INVENTORYENTRIES.LIST"),...node.children.filter(n=>["INVENTORYENTRIESIN.LIST","INVENTORYENTRIESOUT.LIST"].includes(n.name))];
}
export function accountingLedgerNodes(node:XmlNode){
 const direct=preferAllList(node.children,"ALLLEDGERENTRIES.LIST","LEDGERENTRIES.LIST");
 const inventory=inventoryEntryNodes(node);
 const nested=inventory.flatMap(n=>children(n,"ACCOUNTINGALLOCATIONS.LIST"));
 const key=(n:XmlNode)=>value(n,"LEDGERNAME").trim().toLowerCase();
 // Some exports repeat the same ledger at voucher and item level. Count it once,
 // but never hide a disagreement between the two representations.
 for(const name of new Set(nested.map(key))){const top=direct.filter(n=>key(n)===name);if(top.length){
  const sum=(rows:XmlNode[])=>rows.reduce((s,n)=>s+scaled(value(n,"AMOUNT")),0);
  if(sum(top)!==sum(nested.filter(n=>key(n)===name)))throw Error("Item and voucher ledger amounts disagree for "+name);
 }}
 const existing=new Set(direct.map(key));return [...direct,...nested.filter(n=>!existing.has(key(n)))];
}
export function quantity(text:string){const match=text.trim().match(/^(-?\d+(?:\.\d+)?)\s+(.+)$/);if(!match)throw Error("Quantity requires a single base unit: "+text);return {milli:scaled(match[1],1000),unit:match[2]};}
export type TallyDocument=ReturnType<typeof documentFromNode>;
export function documentFromNode(node:XmlNode){
 const guid=value(node,"GUID");if(!guid)throw Error("A stable Tally GUID is required for connected imports.");
 const date=tallyDate(value(node,"DATE"));if(!date)throw Error("Invalid voucher date.");
 const ledgers=accountingLedgerNodes(node).map(n=>({
  name:value(n,"LEDGERNAME"),amount:scaled(value(n,"AMOUNT")),party:value(n,"ISPARTYLEDGER").toLowerCase()==="yes",
  bills:children(n,"BILLALLOCATIONS.LIST").filter(b=>b.children.length>0||b.text.trim()||Object.keys(b.attrs).length>0).map(b=>({reference:value(b,"NAME"),type:value(b,"BILLTYPE"),amount:scaled(value(b,"AMOUNT")),dueDate:tallyDate(value(b,"BILLCREDITPERIOD"))})),
 }));
 const items=inventoryEntryNodes(node).filter(n=>n.children.length>0).map(n=>({
  name:value(n,"STOCKITEMNAME"),...quantity(value(n,"ACTUALQTY")||value(n,"BILLEDQTY")),amount:scaled(value(n,"AMOUNT")),hsn:value(n,"GSTHSNNAME")||value(n,"HSNCODE"),rates:descendants(n,"RATEDETAILS.LIST").map(r=>({head:value(r,"GSTRATEDUTYHEAD"),basisPoints:scaled(value(r,"GSTRATE")||"0")})),
  batches:children(n,"BATCHALLOCATIONS.LIST").map(b=>({name:value(b,"BATCHNAME")||"Primary Batch",warehouse:value(b,"GODOWNNAME")||"Main Location",...quantity(value(b,"ACTUALQTY")||value(b,"BILLEDQTY")),manufactured:tallyDate(value(b,"MFDON")),expiry:tallyDate(value(b,"EXPIRYPERIOD"))})),
 }));
 return {guid,date,revision:value(node,"ALTERID"),type:value(node,"VOUCHERTYPENAME"),number:value(node,"VOUCHERNUMBER"),partyName:value(node,"PARTYLEDGERNAME"),gstin:value(node,"PARTYGSTIN"),placeOfSupply:value(node,"PLACEOFSUPPLY"),address:descendants(node,"ADDRESS").map(n=>n.text).join(", "),cancelled:value(node,"ISCANCELLED").toLowerCase()==="yes",optional:value(node,"ISOPTIONAL").toLowerCase()==="yes",narration:value(node,"NARRATION"),ledgers,items,
  gst:{irn:value(node,"IRN"),ackNumber:value(node,"IRNACKNO")||value(node,"ACKNO"),ackDate:value(node,"IRNACKDATE")||value(node,"ACKDATE"),qr:value(node,"QRCODE"),ewayBill:value(node,"EWAYBILLNUMBER")||value(children(node,"EWAYBILLDETAILS.LIST")[0]||{name:"",text:"",attrs:{},children:[]},"BILLNUMBER"),transport:children(node,"EWAYBILLDETAILS.LIST")},raw:node};
}
