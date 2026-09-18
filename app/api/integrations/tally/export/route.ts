import { NextResponse } from "next/server";
import { getRawDb } from "../../../../../db";
import { getChatGPTUser } from "../../../../company-auth";
import { CORE_ACCOUNTS } from "../../../../lib/accounting";
import { exportVoucher, type ExportLine, type ExportItem, type ExportSource } from "../../../../lib/tally-export";
import { tallyEnvelope, xmlEscape } from "../../../../lib/tally";
import { todayIST } from "../../../../lib/date";

type Profile = { legal_name: string; trade_name: string | null };
type Party = { name: string; gstin: string | null; state: string | null; opening_paise: number };
type Item = { name: string; unit: string; hsn_sac: string | null; opening_stock_milli: number; purchase_price_paise: number };
type Entry = { id: string; entry_number: string; entry_date: string; source_type: string; source_id:string; description: string };
type Line = { account_code:string; entry_id: string; account_name: string; debit_paise: number; credit_paise: number; tally_ledger: string | null };

const parentByCode: Record<string, string> = {
  "1000": "Cash-in-Hand", "1010": "Bank Accounts", "1100": "Current Assets", "1200": "Stock-in-Hand",
  "1300": "Duties & Taxes", "1400": "Current Assets", "1410": "Current Assets", "2000": "Current Liabilities",
  "2100": "Duties & Taxes", "2200": "Current Liabilities", "2210": "Current Liabilities", "3000": "Capital Account",
  "3100": "Capital Account", "4000": "Sales Accounts", "4010": "Indirect Incomes", "4090": "Sales Accounts",
  "5000": "Purchase Accounts", "5090": "Purchase Accounts", "5100": "Direct Expenses", "6000": "Indirect Expenses", "6100": "Indirect Expenses",
};

function ledger(name: string, parent: string, gstin?: string | null, state?: string | null, openingPaise = 0) {
  const opening = openingPaise ? `<OPENINGBALANCE>${(openingPaise / 100).toFixed(2)}</OPENINGBALANCE>` : "";
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xmlEscape(name)}" ACTION="Create"><NAME>${xmlEscape(name)}</NAME><PARENT>${xmlEscape(parent)}</PARENT>${gstin ? `<PARTYGSTIN>${xmlEscape(gstin)}</PARTYGSTIN>` : ""}${state ? `<STATENAME>${xmlEscape(state)}</STATENAME>` : ""}${["Sundry Debtors","Sundry Creditors"].includes(parent)?"<ISBILLWISEON>Yes</ISBILLWISEON>":""}${name.startsWith("Output ")?`<TAXTYPE>GST</TAXTYPE><GSTDUTYHEAD>${xmlEscape(name.slice(7))}</GSTDUTYHEAD>`:""}${opening}</LEDGER></TALLYMESSAGE>`;
}

function itemMaster(item: Item) {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><STOCKITEM NAME="${xmlEscape(item.name)}" ACTION="Create"><NAME>${xmlEscape(item.name)}</NAME><BASEUNITS>${xmlEscape(item.unit)}</BASEUNITS>${item.hsn_sac ? `<GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE><HSNCODE>${xmlEscape(item.hsn_sac)}</HSNCODE>` : ""}<OPENINGBALANCE>${(item.opening_stock_milli / 1000).toFixed(3)} ${xmlEscape(item.unit)}</OPENINGBALANCE><OPENINGRATE>${(item.purchase_price_paise / 100).toFixed(2)}/${xmlEscape(item.unit)}</OPENINGRATE></STOCKITEM></TALLYMESSAGE>`;
}

function unitMaster(name: string) {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><UNIT NAME="${xmlEscape(name)}" ACTION="Create"><NAME>${xmlEscape(name)}</NAME><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT><DECIMALPLACES>3</DECIMALPLACES></UNIT></TALLYMESSAGE>`;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "vouchers" ? "vouchers" : "masters";
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2099-12-31";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ message: "Choose a valid date range." }, { status: 400 });
  }
  const raw = getRawDb();
  const includeOpenings=url.searchParams.get("openings")==="include";
  const itemMode=url.searchParams.get("mode")==="items";
  const profile = await raw.prepare("SELECT legal_name,trade_name FROM business_profiles WHERE owner_user_id=? LIMIT 1").bind(user.id).first<Profile>();
  const company = profile?.trade_name || profile?.legal_name || "Commons Business";
  let messages: string[] = [];
  if (scope === "masters") {
    const [customers, suppliers, products] = await Promise.all([
      raw.prepare("SELECT display_name name,gstin,billing_state state,CASE WHEN balance_type='payable' THEN -opening_balance_paise ELSE opening_balance_paise END opening_paise FROM customers WHERE owner_user_id=? AND id NOT LIKE 'commons-demo-%' ORDER BY display_name").bind(user.id).all<Party>(),
      raw.prepare("SELECT name,gstin,state,opening_payable_paise opening_paise FROM suppliers WHERE owner_user_id=? AND id NOT LIKE 'commons-demo-%' ORDER BY name").bind(user.id).all<Party>(),
      raw.prepare("SELECT name,unit,hsn_sac,opening_stock_milli,purchase_price_paise FROM products WHERE owner_user_id=? AND id NOT LIKE 'commons-demo-%' AND active=1 ORDER BY name").bind(user.id).all<Item>(),
    ]);
    const savedItems = products.results as Item[];
    messages = [
      ...CORE_ACCOUNTS.map((account) => ledger(account.name, parentByCode[account.code] || "Primary")),
      ...["Output CGST","Output SGST","Output IGST","Output Cess"].map(name=>ledger(name,"Duties & Taxes")),
      ...(customers.results as Party[]).map((party) => ledger(party.name, "Sundry Debtors", party.gstin, party.state, includeOpenings?-party.opening_paise:0)),
      ...(suppliers.results as Party[]).map((party) => ledger(party.name, "Sundry Creditors", party.gstin, party.state, includeOpenings?party.opening_paise:0)),
      ...[...new Set(savedItems.map((item) => item.unit))].map(unitMaster),
      ...savedItems.map(item=>itemMaster({...item,opening_stock_milli:includeOpenings?item.opening_stock_milli:0})),
    ];
  } else {
    const [entryResult, lineResult] = await Promise.all([
      raw.prepare("SELECT id,entry_number,entry_date,source_type,source_id,description FROM journal_entries WHERE owner_user_id=? AND status='posted' AND source_type NOT LIKE 'tally_%' AND source_type NOT LIKE 'demo_seed_%' AND entry_date BETWEEN ? AND ? ORDER BY entry_date,id").bind(user.id, from, to).all<Entry>(),
      raw.prepare(`SELECT jl.entry_id,jl.account_code,jl.account_name,jl.debit_paise,jl.credit_paise,
        CASE WHEN jl.account_code='1100' THEN COALESCE(i.customer_name,ip.customer_name,ad.party_name,jl.account_name)
             WHEN jl.account_code='2000' THEN COALESCE(p.supplier_name,ad.party_name,jl.account_name)
             ELSE jl.account_name END tally_ledger
        FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id
        LEFT JOIN invoices i ON i.id=je.source_id AND i.owner_user_id=je.owner_user_id
        LEFT JOIN invoice_payments ip ON ip.id=je.source_id AND ip.owner_user_id=je.owner_user_id
        LEFT JOIN purchases p ON p.id=je.source_id AND p.owner_user_id=je.owner_user_id
        LEFT JOIN adjustment_documents ad ON ad.id=je.source_id AND ad.owner_user_id=je.owner_user_id
        WHERE je.owner_user_id=? AND je.status='posted' AND je.source_type NOT LIKE 'tally_%' AND je.source_type NOT LIKE 'demo_seed_%' AND je.entry_date BETWEEN ? AND ? ORDER BY je.entry_date,je.id`).bind(user.id, from, to).all<Line>(),
    ]);
    const lines = lineResult.results as Line[];
    try{for(const entry of entryResult.results as Entry[]){
      let source:ExportSource|undefined,items:ExportItem[]=[];
      if(entry.source_type==="sales_invoice"){
        const bill=await raw.prepare("SELECT invoice_number number,customer_name party,customer_gstin gstin,customer_address address,place_of_supply place,cgst_paise cgst,sgst_paise sgst,igst_paise igst,cess_paise cess FROM invoices WHERE owner_user_id=? AND id=? AND status!='cancelled'").bind(user.id,entry.source_id).first<ExportSource>();
        if(!bill)throw Error("The bill linked to "+entry.entry_number+" is missing or cancelled. Reconcile it before export.");source={...bill,reference:bill.number,billType:"New Ref"};
        if(itemMode){const rows=await raw.prepare("SELECT p.name,ii.unit,ii.quantity_milli,ii.rate_paise,ii.taxable_paise,ii.hsn_sac hsn FROM invoice_items ii LEFT JOIN products p ON p.id=ii.product_id AND p.owner_user_id=ii.owner_user_id WHERE ii.owner_user_id=? AND ii.invoice_id=? ORDER BY ii.position").bind(user.id,entry.source_id).all<ExportItem>();items=rows.results;if(items.some(i=>!i.name))throw Error("Item mode needs a mapped product for every line in "+bill.number);}
      }else if(entry.source_type==="purchase"){
        const bill=await raw.prepare("SELECT purchase_number number,supplier_name party,supplier_gstin gstin,supplier_invoice_number reference FROM purchases WHERE owner_user_id=? AND id=? AND status='received'").bind(user.id,entry.source_id).first<ExportSource>();
        if(!bill)throw Error("The purchase linked to "+entry.entry_number+" is not received. Reconcile it before export.");source={...bill,reference:bill.reference||bill.number,billType:"New Ref"};
        if(itemMode){const rows=await raw.prepare("SELECT p.name,pi.unit,pi.quantity_milli,pi.unit_cost_paise rate_paise,pi.taxable_paise,p.hsn_sac hsn FROM purchase_items pi JOIN products p ON p.id=pi.product_id AND p.owner_user_id=pi.owner_user_id WHERE pi.owner_user_id=? AND pi.purchase_id=? ORDER BY pi.position").bind(user.id,entry.source_id).all<ExportItem>();items=rows.results;if(!items.length)throw Error("No stock items found for "+bill.number);}
      }else if(entry.source_type==="invoice_receipt"){
        const payment=await raw.prepare("SELECT customer_name party,invoice_number reference FROM invoice_payments WHERE owner_user_id=? AND id=?").bind(user.id,entry.source_id).first<{party:string;reference:string}>();
        if(!payment)throw Error("Receipt allocation is missing for "+entry.entry_number);source={...payment,number:entry.entry_number,billType:"Agst Ref"};
      }
      messages.push(exportVoucher(entry,lines.filter(line=>line.entry_id===entry.id) as ExportLine[],source,items));
    }}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"Export could not be validated."},{status:409});}
  }
  const body = tallyEnvelope(company, messages, scope === "masters" ? "All Masters" : "Vouchers");
  const filename = `commons-to-tally-${scope}-${todayIST()}.xml`;
  return new NextResponse(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
