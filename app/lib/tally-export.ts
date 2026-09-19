import { xmlEscape } from "./tally";
import { tallyDate } from "./tally-document";
export type ExportEntry={id:string;entry_number:string;entry_date:string;source_type:string;description:string};
export type ExportLine={entry_id:string;account_code:string;account_name:string;debit_paise:number;credit_paise:number;tally_ledger:string|null};
export type ExportSource={number:string;party:string;gstin?:string|null;address?:string|null;place?:string|null;reference?:string|null;billType?:string;cgst?:number;sgst?:number;igst?:number;cess?:number};
export type ExportItem={name:string;unit:string;quantity_milli:number;rate_paise:number;taxable_paise:number;hsn?:string|null};
const tag=(name:string,value:unknown)=>`<${name}>${xmlEscape(value)}</${name}>`;
const money=(paise:number)=>{if(!Number.isSafeInteger(paise))throw Error("Amount exceeds supported precision.");return (paise/100).toFixed(2);};
export type TallyLedgerMaster={name:string;top_group:string|null};
export type ExportOptions={resolve:(accountCode:string,name:string,ratePct:number)=>string;dropInternalStock:boolean};
// Commons posts to its own generic ledger names ("Sales", "Output CGST"...), but every
// Tally company names these differently ("Gst Sales @18%", "CGST"). Rather than asking the
// user to import Commons' ledgers into Tally, pick the closest ledger the company already
// has, using the group each ledger was synced under. If nothing suitable exists the
// Commons name is left as-is, so the connector still blocks safely instead of mis-posting.
export function ledgerResolver(masters:TallyLedgerMaster[]):ExportOptions["resolve"]{
 const inGroup=(g:RegExp)=>masters.filter(m=>g.test(m.top_group||"")).map(m=>m.name);
 const sales=inGroup(/^sales accounts$/i).filter(n=>/sales/i.test(n)&&!/discount|export|fixed|waste|scrap|return|incentive|igst|form/i.test(n));
 const taxes=inGroup(/^duties (&|and) taxes$/i).filter(n=>!/input|itc|rcm|reverse|ineligible|paid|payable on/i.test(n));
 const banks=inGroup(/^bank accounts$/i),cash=inGroup(/^cash-in-hand$/i);
 const withRate=(names:string[],rate:number)=>rate>0?names.find(n=>new RegExp("(^|[^0-9.])"+rate+"(\\.0+)?([^0-9]|$)").test(n)):undefined;
 const shortest=(names:string[])=>[...names].sort((a,b)=>a.length-b.length)[0];
 const tax=(word:RegExp,rate:number)=>{const c=taxes.filter(n=>word.test(n));return c.length?withRate(c,rate)||shortest(c):undefined;};
 return (code,name,rate)=>{
  if(code==="4000")return withRate(sales,rate)||shortest(sales.filter(n=>/gst|sales/i.test(n)))||name;
  if(code==="2100"){
   if(/cgst/i.test(name))return tax(/cgst/i,rate/2)||name;
   if(/sgst/i.test(name))return tax(/(sgst|utgst)/i,rate/2)||name;
   if(/igst/i.test(name))return tax(/igst/i,rate)||name;
  }
  if(code==="1000")return cash.find(n=>/^cash$/i.test(n))||(cash.length===1?cash[0]:name);
  if(code==="1010")return banks.length===1?banks[0]:name;
  return name;
 };
}
export function exportVoucherType(source:string){
 if(source==="sales_invoice")return "Sales";if(source==="purchase")return "Purchase";
 if(["invoice_receipt","bank_receipt","money_in"].includes(source))return "Receipt";
 if(["money_out","payroll"].includes(source))return "Payment";if(source==="transfer")return "Contra";
 if(["credit_note","sales_return"].includes(source))return "Credit Note";
 if(["debit_note","purchase_return"].includes(source))return "Debit Note";return "Journal";
}
export function exportVoucher(entry:ExportEntry,original:ExportLine[],source?:ExportSource,items:ExportItem[]=[],opts?:ExportOptions){
 const date=entry.entry_date.replaceAll("-","");if(!tallyDate(date))throw Error(`Invalid date on ${entry.entry_number}.`);
 if(original.some(l=>!Number.isSafeInteger(l.debit_paise)||!Number.isSafeInteger(l.credit_paise)||l.debit_paise<0||l.credit_paise<0||l.debit_paise>0&&l.credit_paise>0))throw Error(`Invalid amount on ${entry.entry_number}.`);
 const debit=original.reduce((s,l)=>s+l.debit_paise,0),credit=original.reduce((s,l)=>s+l.credit_paise,0);
 if(!Number.isSafeInteger(debit)||!Number.isSafeInteger(credit)||!debit||debit!==credit)throw Error(`Unbalanced voucher ${entry.entry_number}.`);
 let lines=original.filter(l=>l.debit_paise||l.credit_paise).map(l=>({...l}));
 const purchase=entry.source_type==="purchase",sale=entry.source_type==="sales_invoice";
 // Tally values stock and cost of sales from its own inventory, so Commons' internal
 // cost/stock pair (always self-balancing) is not sent; posting it would double count.
 if(opts?.dropInternalStock&&sale)lines=lines.filter(l=>!["5100","1200"].includes(l.account_code));
 const taxable=lines.filter(l=>l.account_code==="4000").reduce((sum,l)=>sum+l.credit_paise-l.debit_paise,0);
 const ratePct=sale&&taxable>0&&source?Math.round((((source.cgst||0)+(source.sgst||0)+(source.igst||0))*100)/taxable):0;
 // Sales tax components come from the saved bill, never inferred from a GSTIN.
 if(sale&&source){const components=[["Output CGST",source.cgst||0],["Output SGST",source.sgst||0],["Output IGST",source.igst||0],["Output Cess",source.cess||0]] as const;
  const tax=lines.filter(l=>l.account_code==="2100").reduce((sum,l)=>sum+l.credit_paise-l.debit_paise,0);
  if(components.reduce((s,c)=>s+c[1],0)!==tax)throw Error(`GST components do not reconcile for ${source.number}.`);
  lines=lines.filter(l=>l.account_code!=="2100");for(const [name,amount]of components)if(amount)lines.push({entry_id:entry.id,account_code:"2100",account_name:name,tally_ledger:opts?opts.resolve('2100',name,ratePct):name,debit_paise:0,credit_paise:amount});
 }
 let inventory="";
 if(items.length){
  if(!sale&&!purchase)throw Error("Item export supports sales and purchase vouchers only.");
  const allocation=lines.filter(l=>l.account_code===(sale?"4000":"1200"));
  const total=items.reduce((sum,item)=>sum+item.taxable_paise,0);
  if(allocation.length!==1||Math.abs(allocation[0].credit_paise-allocation[0].debit_paise)!==total)throw Error(`Item totals do not reconcile for ${entry.entry_number}.`);
  lines=lines.filter(l=>l!==allocation[0]);
  inventory=items.map(item=>{
   if(!item.name||!item.unit||!Number.isSafeInteger(item.quantity_milli)||item.quantity_milli<=0||!Number.isSafeInteger(item.taxable_paise)||item.taxable_paise<0)throw Error("Invalid stock item in "+entry.entry_number);
   const qty=(item.quantity_milli/1000).toFixed(3)+" "+item.unit,amount=money((purchase?-1:1)*item.taxable_paise),positive=purchase?"Yes":"No";
   return `<ALLINVENTORYENTRIES.LIST>${tag("STOCKITEMNAME",item.name)}${tag("ISDEEMEDPOSITIVE",positive)}${tag("RATE",money(item.rate_paise)+"/"+item.unit)}${tag("AMOUNT",amount)}${tag("ACTUALQTY",qty)}${tag("BILLEDQTY",qty)}${item.hsn?tag("GSTHSNNAME",item.hsn):""}<ACCOUNTINGALLOCATIONS.LIST>${tag("LEDGERNAME",allocation[0].tally_ledger||allocation[0].account_name)}${tag("ISDEEMEDPOSITIVE",positive)}${tag("AMOUNT",amount)}</ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>`;
  }).join("");
 }
 const entries=lines.map(line=>{
  const amount=money(line.credit_paise-line.debit_paise),party=!!source?.party&&["1100","2000"].includes(line.account_code);
  const base=line.tally_ledger||line.account_name,name=party?source!.party:opts&&line.account_code!=="2100"?opts.resolve(line.account_code,base,ratePct):base;
  const bill=party&&source?.reference?`<BILLALLOCATIONS.LIST>${tag("NAME",source.reference)}${tag("BILLTYPE",source.billType||"New Ref")}${tag("AMOUNT",amount)}</BILLALLOCATIONS.LIST>`:"";
  return `<ALLLEDGERENTRIES.LIST>${tag("LEDGERNAME",name)}${tag("ISDEEMEDPOSITIVE",line.debit_paise?"Yes":"No")}${tag("ISPARTYLEDGER",party?"Yes":"No")}${tag("AMOUNT",amount)}${bill}</ALLLEDGERENTRIES.LIST>`;
 }).join("");
 const view=items.length?"Invoice Voucher View":"Accounting Voucher View";
 return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${exportVoucherType(entry.source_type)}" ACTION="Create" REMOTEID="commons:${xmlEscape(entry.id)}">${tag("GUID",entry.id)}${tag("DATE",date)}${tag("VOUCHERTYPENAME",exportVoucherType(entry.source_type))}${tag("VOUCHERNUMBER",source?.number||entry.entry_number)}${tag("REFERENCE",source?.reference||source?.number||entry.entry_number)}${tag("NARRATION",entry.description)}${tag("PERSISTEDVIEW",view)}${tag("ISINVOICE",items.length?"Yes":"No")}${source?.party?tag("PARTYLEDGERNAME",source.party):""}${source?.gstin?tag("PARTYGSTIN",source.gstin):""}${source?.place?tag("PLACEOFSUPPLY",source.place):""}${source?.address?`<ADDRESS.LIST TYPE="String">${tag("ADDRESS",source.address)}</ADDRESS.LIST>`:""}${entries}${inventory}</VOUCHER></TALLYMESSAGE>`;
}
