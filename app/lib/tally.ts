import { CORE_ACCOUNTS, type BookLine } from "./accounting";
import { parseXml, descendants, value, scaled, tallyDate, accountingLedgerNodes } from "./tally-document";

export type TallyVoucher = {
  key: string;
  legacyKey: string;
  date: string;
  type: string;
  number: string;
  narration: string;
  lines: BookLine[];
  issues: string[];
};

export const TALLY_LEDGER_MAP: Record<string, { code: string; name: string }> = {
  "cash": { code: "1000", name: "Cash in hand" },
  "cash in hand": { code: "1000", name: "Cash in hand" },
  "bank account": { code: "1010", name: "Bank account" },
  "bank accounts": { code: "1010", name: "Bank account" },
  "customer money due": { code: "1100", name: "Customer money due" },
  "sundry debtors": { code: "1100", name: "Customer money due" },
  "stock on hand": { code: "1200", name: "Stock on hand" },
  "stock-in-hand": { code: "1200", name: "Stock on hand" },
  "input gst credit": { code: "1300", name: "Input GST credit" },
  "input cgst": { code: "1300", name: "Input GST credit" },
  "input sgst": { code: "1300", name: "Input GST credit" },
  "input igst": { code: "1300", name: "Input GST credit" },
  "supplier advances": { code: "1400", name: "Supplier advances" },
  "employee advances": { code: "1410", name: "Employee advances" },
  "supplier money due": { code: "2000", name: "Supplier money due" },
  "sundry creditors": { code: "2000", name: "Supplier money due" },
  "gst payable": { code: "2100", name: "GST payable" },
  "output cgst": { code: "2100", name: "GST payable" },
  "output sgst": { code: "2100", name: "GST payable" },
  "output igst": { code: "2100", name: "GST payable" },
  "customer advances": { code: "2200", name: "Customer advances" },
  "payroll deductions payable": { code: "2210", name: "Payroll deductions payable" },
  "owner's capital": { code: "3000", name: "Owner's capital" },
  "capital account": { code: "3000", name: "Owner's capital" },
  "opening balance equity": { code: "3100", name: "Opening balance equity" },
  "sales": { code: "4000", name: "Sales" },
  "sales accounts": { code: "4000", name: "Sales" },
  "other income": { code: "4010", name: "Other income" },
  "indirect incomes": { code: "4010", name: "Other income" },
  "sales returned": { code: "4090", name: "Sales returned" },
  "sales return": { code: "4090", name: "Sales returned" },
  "goods purchased": { code: "5000", name: "Goods purchased" },
  "purchase accounts": { code: "5000", name: "Goods purchased" },
  "purchases returned": { code: "5090", name: "Purchases returned" },
  "purchase returns": { code: "5090", name: "Purchases returned" },
  "cost of goods sold": { code: "5100", name: "Cost of goods sold" },
  "business expenses": { code: "6000", name: "Business expenses" },
  "indirect expenses": { code: "6000", name: "Business expenses" },
  "salary expense": { code: "6100", name: "Salary expense" },
  "salaries & wages": { code: "6100", name: "Salary expense" },
};

export function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function parseTallyVouchers(xml:string,parties:{customers:string[];suppliers:string[];mappings?:Record<string,string>}){
 const customerNames=new Set(parties.customers.map(n=>n.toLowerCase().trim()));
 const supplierNames=new Set(parties.suppliers.map(n=>n.toLowerCase().trim()));
 const nodes=descendants(parseXml(xml),"VOUCHER");if(nodes.length>500)throw Error("At most 500 vouchers can be parsed at once.");
 return nodes.map((node,index):TallyVoucher=>{
  const date=tallyDate(value(node,"DATE")),type=value(node,"VOUCHERTYPENAME")||"Journal",number=value(node,"VOUCHERNUMBER")||`ROW-${index+1}`;
  const narration=value(node,"NARRATION")||`Imported ${type} ${number}`,issues:string[]=[],lines:BookLine[]=[];
  if(!date)issues.push("Missing or invalid date");
  for(const entry of accountingLedgerNodes(node)){
   const name=value(entry,"LEDGERNAME"),key=name.toLowerCase().trim();
   const custom=CORE_ACCOUNTS.find(a=>a.code===parties.mappings?.[key]);
   const mapped=custom||TALLY_LEDGER_MAP[key]||(customerNames.has(key)?{code:"1100",name:"Customer money due"}:null)||(supplierNames.has(key)?{code:"2000",name:"Supplier money due"}:null);
   if(!custom&&customerNames.has(key)&&supplierNames.has(key)){issues.push(`Map ledger “${name}”`);continue;}
   if(!name||!mapped){issues.push(name?`Map ledger “${name}”`:"Missing ledger name");continue;}
   const amount=scaled(value(entry,"AMOUNT"));if(!amount)continue;
   const deemed=value(entry,"ISDEEMEDPOSITIVE").toLowerCase();
   if(deemed&&!['yes','no'].includes(deemed)||deemed&&((deemed==='yes')!==(amount<0))){issues.push("Ledger debit/credit sign disagrees for "+name);continue;}
   lines.push({accountCode:mapped.code,accountName:mapped.name,debitPaise:Math.max(0,-amount),creditPaise:Math.max(0,amount)});
  }
  const debits=lines.reduce((s,l)=>s+l.debitPaise,0),credits=lines.reduce((s,l)=>s+l.creditPaise,0);
  if(!Number.isSafeInteger(debits)||!Number.isSafeInteger(credits))issues.push("Voucher exceeds supported precision");
  if(!debits)issues.push("No non-zero ledger lines found");
  if(debits!==credits)issues.push(`Voucher is not balanced (₹${Math.abs(debits-credits)/100})`);
  if(value(node,"ISCANCELLED").toLowerCase()==="yes"||value(node,"ISOPTIONAL").toLowerCase()==="yes")issues.push("Cancelled or optional vouchers require manual review");
  const legacyKey=`tally:${date||"unknown"}:${type}:${number}`,guid=value(node,"GUID");
  return {key:guid?`tally-guid:${guid}`:legacyKey,legacyKey,date,type,number,narration,lines,issues:[...new Set(issues)]};
 });
}

export function tallyEnvelope(company: string, messages: string[], reportName = "All Masters") {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>${xmlEscape(reportName)}</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${messages.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
