import { getRawDb } from "../../db";
import { assertPeriodOpen,prepareJournal } from "./book-server";
import { digest } from "./tally-bridge";
import { parseTallyVouchers,resolveMasterLedgerCode,TALLY_LEDGER_MAP } from "./tally";
import { CORE_ACCOUNTS,type BookLine } from "./accounting";
import { documentFromNode,descendants,parseXml,type TallyDocument } from "./tally-document";

type Prior={id:string;revision:string;payload:string;local_id:string|null;journal_id:string|null};
// TallyPrime names these voucher types "GST Sales"/"GST Purchase" (etc.) once GST is
// enabled on the company — they are the same transaction, just with the GST prefix.
const VOUCHER_TYPE_ALIASES:Record<string,string>={"gst sales":"sales","gst purchase":"purchase","gst credit note":"credit note","gst debit note":"debit note","gst sales igst":"sales","export- gst sales":"sales","sales form 8":"sales","sales form 8b":"sales","purchase ( expences)":"purchase","purchase (capital goods)":"purchase","debit note gst":"debit note"};
const normalizeVoucherType=(type:string)=>VOUCHER_TYPE_ALIASES[type]||type;
export async function prepareConnectedImport(owner:string,actor:string,xml:string,mappings:Record<string,string>={}){
 const raw=getRawDb();const nodes=descendants(parseXml(xml),"VOUCHER");if(nodes.length!==1)throw Error("Review one connected voucher at a time.");
 let doc=documentFromNode(nodes[0]);const semantic={...doc,raw:undefined};const revision=await digest(JSON.stringify(semantic));
 const prior=await raw.prepare("SELECT * FROM tally_documents WHERE owner_user_id=? AND guid=? ORDER BY created_at DESC,rowid DESC LIMIT 1").bind(owner,doc.guid).first<Prior>();
 const key=`tally-guid:${doc.guid}`;const issues:string[]=[];
 const id="td-"+(await digest(owner+":"+doc.guid)).slice(0,40);
 const priorDoc: TallyDocument|null=prior?JSON.parse(prior.payload):null;
 if(doc.cancelled&&priorDoc)doc={...priorDoc,cancelled:true,revision:doc.revision,raw:doc.raw};
 if(prior?.revision===revision)return {doc,issues:[],duplicate:true,statements:[],effects:["Already synchronised"]};
 if(priorDoc&&/^\d+$/.test(priorDoc.revision)&&/^\d+$/.test(doc.revision)&&BigInt(doc.revision)<=BigInt(priorDoc.revision))issues.push("This payload is older than the current Tally revision, or changed without a new alteration ID. Export the latest voucher again.");
 if(doc.items.length&&!["sales","purchase","credit note","debit note"].includes(normalizeVoucherType(doc.type.toLowerCase())))issues.push("Inventory in this voucher type needs a verified stock movement mapping.");
 if(doc.optional)issues.push("Optional vouchers must be made regular in Tally before import.");
 const type=normalizeVoucherType(doc.type.toLowerCase());const sale=type==="sales",purchase=type==="purchase",receipt=type==="receipt",payment=type==="payment",credit=type==="credit note",debit=type==="debit note";
 if(!["sales","purchase","receipt","payment","journal","contra","credit note","debit note"].includes(type))issues.push("This voucher type requires a verified mapping: "+doc.type);
 if(priorDoc && priorDoc.type!==doc.type)issues.push("Changing the voucher type requires accountant review and a separate correction.");
 if(priorDoc && priorDoc.partyName!==doc.partyName)issues.push("Changing the party on an imported voucher requires a reviewed party reassignment.");
 try{await assertPeriodOpen(owner,doc.date);if(priorDoc)await assertPeriodOpen(owner,priorDoc.date);}catch{issues.push("The original or new accounting period is locked.");}
 const statements: ReturnType<typeof raw.prepare>[]=[];const now=Date.now();
 // Tally numbers repeat across financial years and voucher series, but Commons keeps each
 // invoice/purchase/credit-note number unique per company. On a clash keep the Tally number
 // readable and add a short suffix derived from the voucher GUID (stable across revisions).
 const uniqueNumber=async(table:string,column:string)=>{const number=doc.number;if(!number)return number;
  const clash=await raw.prepare(`SELECT 1 x FROM ${table} WHERE owner_user_id=? AND ${column}=? AND id!=? LIMIT 1`).bind(owner,number,id).first();
  return clash?`${number}~${(await digest(doc.guid)).slice(0,6)}`:number;};
 const customers=await raw.prepare("SELECT id,display_name name FROM customers WHERE owner_user_id=?").bind(owner).all<{id:string;name:string}>();
 const suppliers=await raw.prepare("SELECT id,name FROM suppliers WHERE owner_user_id=?").bind(owner).all<{id:string;name:string}>();
 const customerKind=sale||receipt||credit;const supplierKind=purchase||payment||debit;
 let partyId="";const partyName=doc.partyName;
 if(customerKind||supplierKind){
  if(!partyName)issues.push("Party ledger is missing.");
  const list=customerKind?customers.results:suppliers.results;const matched=list.filter(row=>row.name===partyName);
  if(matched.length>1)issues.push("Multiple parties share the Tally ledger name; resolve the mapping first.");
  partyId=matched[0]?.id||"tp-"+(await digest(owner+":"+(customerKind?"customer":"supplier")+":"+partyName)).slice(0,40);
  if(!matched.length&&partyName){
   if(customerKind)statements.push(raw.prepare("INSERT OR IGNORE INTO customers(id,owner_user_id,display_name,primary_phone,gstin,gst_registration_type,place_of_supply,billing_address_line_1,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(partyId,owner,partyName,"",doc.gstin||null,doc.gstin?"regular":"unregistered",doc.placeOfSupply||null,doc.address||null,now,now));
   else statements.push(raw.prepare("INSERT OR IGNORE INTO suppliers(id,owner_user_id,name,primary_phone,gstin,gst_registration_type,address_line_1,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(partyId,owner,partyName,"",doc.gstin||null,doc.gstin?"regular":"unregistered",doc.address||null,now,now));
  }
 }
 const ledgerXml=xml;
 // Ledgers synced from Tally's own Group hierarchy (see /api/integrations/tally/connector
 // action="masters") auto-resolve unambiguous groups, so only genuinely ambiguous ledgers
 // (shared customer/supplier names, custom groups) still need an explicit manual mapping.
 const ledgerMasters=await raw.prepare("SELECT name,top_group topGroup FROM tally_masters WHERE owner_user_id=? AND kind='ledger'").bind(owner).all<{name:string;topGroup:string|null}>();
 const autoMappings:Record<string,string>={};
 for(const row of ledgerMasters.results){const code=resolveMasterLedgerCode(row.name,row.topGroup);if(code)autoMappings[row.name.toLowerCase().trim()]=code;}
 // Account choices the user saved for ledgers Tally's own groups can't classify (kept as kind
 // 'mapping' so a later master sync, which rewrites kind 'ledger' rows, never erases them).
 const savedMappings=await raw.prepare("SELECT name,top_group code FROM tally_masters WHERE owner_user_id=? AND kind='mapping'").bind(owner).all<{name:string;code:string}>();
 for(const row of savedMappings.results)if(/^\d{4}$/.test(row.code))autoMappings[row.name.toLowerCase().trim()]=row.code;
 const mergedMappings={...autoMappings,...mappings};
 const stockMasters=await raw.prepare("SELECT name,unit,gst_rate_basis_points gstRate,cost_paise costPaise FROM tally_masters WHERE owner_user_id=? AND kind='stockitem'").bind(owner).all<{name:string;unit:string|null;gstRate:number|null;costPaise:number|null}>();
 const stockMasterByName=new Map(stockMasters.results.map(r=>[r.name.toLowerCase().trim(),r]));
 const parsed=parseTallyVouchers(ledgerXml,{customers:[...customers.results.map(r=>r.name),...(customerKind?[partyName]:[])],suppliers:[...suppliers.results.map(r=>r.name),...(supplierKind?[partyName]:[])],mappings:mergedMappings})[0];
 if(!doc.cancelled)issues.push(...(parsed?.issues||["Voucher has no ledger lines."]));
 const partyLine=doc.ledgers.find(l=>l.name===partyName);const total=Math.abs(partyLine?.amount||0);
 if((sale||purchase||credit||debit)&&!total&&!doc.cancelled)issues.push("Party amount is missing.");
 // Resolve a ledger's account code the same way parseTallyVouchers would (custom/master
 // mapping, then the built-in map, then customer/supplier fallback) so callers below can
 // reason about which lines are "core" (party/sales/purchase/tax) vs "other" by actual
 // resolved code instead of assumption or loose name matching.
 const resolvedCodeFor=(ledgerName:string):string|undefined=>{
  const key=ledgerName.toLowerCase().trim();
  const customCode=mergedMappings[key];
  if(customCode&&CORE_ACCOUNTS.some(a=>a.code===customCode))return customCode;
  if(TALLY_LEDGER_MAP[key])return TALLY_LEDGER_MAP[key].code;
  if(customerKind&&customers.results.some(c=>c.name===ledgerName))return "1100";
  if(supplierKind&&suppliers.results.some(s=>s.name===ledgerName))return "2000";
  return undefined;
 };
 // A ledger literally named e.g. "IGST Sales 18%" contains the substring "igst" but is
 // the sales ledger itself, not the tax ledger — confirmed on a real voucher where that
 // double-counted the sale as its own tax. Only count a name match as tax when it isn't
 // also resolving to the sales/purchase account.
 const tax=(name:string)=>doc.ledgers.filter(l=>{
  const code=resolvedCodeFor(l.name);
  return code!=="4000"&&code!=="5000"&&l.name.toLowerCase().includes(name);
 }).reduce((sum,l)=>sum+Math.abs(l.amount),0);
 const cgst=tax("cgst"),sgst=tax("sgst"),igst=tax("igst"),cess=tax("cess"),taxTotal=cgst+sgst+igst+cess;
 const itemTotal=doc.items.reduce((sum,i)=>sum+Math.abs(i.amount),0);
 // Discount, freight, packing and round-off ledgers are real accounting lines already
 // posted correctly via parsed.lines below — they just aren't the party/sales-purchase/
 // tax lines itemTotal and taxTotal already cover. The voucher's overall balance is
 // verified elsewhere, so any such extra line is by construction exactly the gap between
 // item+tax and the party total; including it here stops a real, balanced discount or
 // freight voucher from being wrongly flagged. (Reads from parsed.lines, which is already
 // categorised by account code, rather than name-matching doc.ledgers a second time.)
 // The party ledger doesn't always resolve to the assumed 1100/2000: a cash sale's
 // "party" is literally the Cash ledger, which auto-maps to 1000 (Cash-in-Hand) via its
 // own group — confirmed on a real voucher where that caused the Cash line to be double
 // counted (once as the party total, again as an "other" line). Exclude whichever code it
 // actually resolves to here too, instead of only ever assuming 1100/2000.
 const partyCode=resolvedCodeFor(partyName)||(customerKind?"1100":supplierKind?"2000":undefined);
 const CORE_CODES=new Set(["2100","1300","4000","5000",...(partyCode?[partyCode]:["1100","2000"])]);
 const otherLedgerTotal=(parsed?.lines||[]).filter(l=>!CORE_CODES.has(l.accountCode)).reduce((sum,l)=>sum+l.creditPaise-l.debitPaise,0);
 // itemTotal/taxTotal are magnitudes (sign-agnostic); otherLedgerTotal is a real signed
 // credit-minus-debit figure. Whether it should add to or subtract from item+tax to reach
 // the party total depends on which side the party itself sits on — debited (sales/
 // receipts and similar: party owes less by exactly any discount/round-off credit) versus
 // credited (purchases/payments: the opposite). Confirmed against both a cash-sale voucher
 // (party debited) and a purchase voucher (party credited) with a real Round Off line.
 const partySign=partyLine&&partyLine.amount<0?-1:1;
 if(doc.items.length && (sale||purchase||credit||debit) && itemTotal+taxTotal-partySign*otherLedgerTotal!==total)issues.push("Item amounts, tax and other charges do not equal the party total.");
 // Only bills have a party total for the tax to be measured against. A journal (GST set-off,
 // write-off, year-end entries) has no party line at all, so total is 0 and any GST-named ledger
 // used to look like "tax exceeds total" -- which held back real journals on a live company.
 if((sale||purchase||credit||debit)&&taxTotal>total)issues.push("Tax exceeds the voucher total.");
 const products=await raw.prepare("SELECT id,name,unit,purchase_price_paise FROM products WHERE owner_user_id=?").bind(owner).all<{id:string;name:string;unit:string;purchase_price_paise:number}>();
 const itemRows:(TallyDocument["items"][number]&{productId:string;qty:number;rate:number;itemTax:number;gstRate:number;cost:number})[]=[];
 for(const item of doc.items){
  const matches=products.results.filter(p=>p.name===item.name);if(matches.length>1)issues.push("Stock-item name is ambiguous: "+item.name);
  const master=stockMasterByName.get(item.name.toLowerCase().trim());
  if((sale||debit)&&!matches.length&&!master&&!doc.cancelled)issues.push("Add or import the stock item with its purchase cost before importing this stock-out: "+item.name);
  if(matches[0]&&matches[0].unit!==item.unit)issues.push("Unit conversion needs review for "+item.name);
  const productId=matches[0]?.id||"ti-"+(await digest(owner+":"+item.name)).slice(0,40);
  const amount=Math.abs(item.amount),qty=Math.abs(item.milli);if(!qty)issues.push("Zero quantity for "+item.name);
  const rate=qty?Math.round(amount*1000/qty):0;
  // Prefer Tally's own stock-item master (unit/GST rate/cost) over a guess when Commons
  // has never seen this product before — it is the same source of truth Tally itself uses.
  if(!matches.length&&!itemRows.some(r=>r.productId===productId))statements.push(raw.prepare("INSERT OR IGNORE INTO products(id,owner_user_id,name,unit,hsn_sac,purchase_price_paise,sale_price_paise,gst_rate_basis_points,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(productId,owner,item.name,master?.unit||item.unit,item.hsn||null,purchase?rate:(master?.costPaise||0),sale?rate:0,master?.gstRate||0,now,now));
  if(item.batches.length&&item.batches.reduce((sum,b)=>sum+Math.abs(b.milli),0)!==qty)issues.push("Batch quantities do not equal the item quantity for "+item.name);
  const masterRate=item.rates.length?null:master?.gstRate??null;
  const gstRate=item.rates.length?item.rates.filter(r=>!r.head.toLowerCase().includes("cess")).reduce((sum,r)=>sum+r.basisPoints,0):(masterRate||0);
  const allRate=item.rates.length?item.rates.reduce((sum,r)=>sum+r.basisPoints,0):(masterRate||0);
  if(taxTotal&&doc.items.length>1&&!item.rates.length&&masterRate===null)issues.push("Per-item GST rates are missing for "+item.name+". Export the full tax details from Tally.");
  const itemTax=doc.items.length===1?taxTotal:Math.round(amount*allRate/10000);
  itemRows.push({...item,productId,qty,rate,itemTax,gstRate:gstRate||(doc.items.length===1&&amount?Math.round((taxTotal-cess)*10000/amount):0),cost:matches[0]?.purchase_price_paise??master?.costPaise??rate});
 }
 const affectedBills=new Set<string>();
 // Each item's tax is independently rounded to the nearest paisa, so summing several
 // items can legitimately land a few paise away from the voucher-level tax total —
 // allow one paisa of rounding slack per item instead of demanding exact equality.
 if(doc.items.length&&Math.abs(itemRows.reduce((sum,item)=>sum+item.itemTax,0)-taxTotal)>itemRows.length)issues.push("Per-item taxes do not reconcile with the voucher tax ledgers.");
 for(const bill of priorDoc?.ledgers.flatMap(l=>l.bills)||[])affectedBills.add(bill.reference);
 for(const bill of doc.ledgers.flatMap(l=>l.bills))affectedBills.add(bill.reference);
 const linkedBills: {invoiceId:string;reference:string;amount:number}[]=[];
 // Tally marks a bill "Agst Ref" only once it's matched to a real invoice; "New Ref"/
 // "Advance"/"On Account" are equally valid Tally outcomes for money received before any
 // bill exists yet. These are tracked as advances (visible in the Advances module) rather
 // than blocked — the underlying journal entry is unaffected either way.
 const advanceBills:{reference:string;amount:number}[]=[];
 if(receipt&&!doc.cancelled){
  const bills=partyLine?.bills||[];
  if(!bills.length){
   // Tally sent a completely empty bill-allocation list — confirmed on real data this
   // means the receipt was entered without tagging it to any bill at all, not that data
   // is missing from our side. That is real, accurate information ("this money came in
   // from this customer, unallocated") — record the full amount as an advance instead of
   // blocking the voucher indefinitely; it can be applied to a specific bill later.
   if(total)advanceBills.push({reference:doc.number||key,amount:total});
  }else{
   for(const bill of bills){
    if(bill.type.toLowerCase()!=="agst ref") {advanceBills.push({reference:bill.reference,amount:Math.abs(bill.amount)});continue;}
    const rows=await raw.prepare("SELECT id,total_paise,paid_paise FROM invoices WHERE owner_user_id=? AND customer_id=? AND invoice_number=? AND status!='cancelled'").bind(owner,partyId,bill.reference).all<{id:string;total_paise:number;paid_paise:number}>();
    if(rows.results.length!==1){issues.push("Bill reference is missing or ambiguous: "+bill.reference);continue;}
    const old=await raw.prepare("SELECT COALESCE(SUM(amount_paise),0) amount FROM invoice_payments WHERE owner_user_id=? AND invoice_id=? AND reference=?").bind(owner,rows.results[0].id,key).first<{amount:number}>();
    if(rows.results[0].paid_paise-(old?.amount||0)+linkedBills.filter(b=>b.invoiceId===rows.results[0].id).reduce((sum,b)=>sum+b.amount,0)+Math.abs(bill.amount)>rows.results[0].total_paise)issues.push("Receipt would overpay bill "+bill.reference);
    linkedBills.push({invoiceId:rows.results[0].id,reference:bill.reference,amount:Math.abs(bill.amount)});
   }
   if(bills.reduce((sum,b)=>sum+Math.abs(b.amount),0)!==total)issues.push("Receipt allocations do not equal its party amount.");
  }
 }
 if(priorDoc && (sale||purchase)){
  if(sale){const paid=await raw.prepare("SELECT paid_paise FROM invoices WHERE id=? AND owner_user_id=?").bind(id,owner).first<{paid_paise:number}>();if(paid?.paid_paise && (doc.cancelled||paid.paid_paise>total))issues.push("Reverse related receipts before cancelling or reducing this bill below the amount received.");}
 }
 const legacy=!prior?await raw.prepare("SELECT id FROM journal_entries WHERE owner_user_id=? AND source_type='tally_import' AND source_id IN (?,?)").bind(owner,key,parsed.legacyKey).first<{id:string}>():null;
 if(legacy){
  const saved=await raw.prepare("SELECT account_code,SUM(debit_paise-credit_paise) amount FROM journal_lines WHERE owner_user_id=? AND entry_id=? GROUP BY account_code ORDER BY account_code").bind(owner,legacy.id).all<{account_code:string;amount:number}>();
  const expected=new Map<string,number>();for(const line of parsed.lines)expected.set(line.accountCode,(expected.get(line.accountCode)||0)+line.debitPaise-line.creditPaise);
  if(doc.cancelled||JSON.stringify(saved.results.map(l=>[l.account_code,l.amount]))!==JSON.stringify([...expected].sort((a,b)=>a[0].localeCompare(b[0]))))issues.push("Existing accounting-only import differs from this voucher. Reconcile it before linking business records.");
 }
 const effects=[...(sale?["Customer bill and receivables"]:[]),...(purchase?["Supplier purchase"]:[]),...(receipt?["Bill allocations and receipts"]:[]),...(doc.items.length?["Products and stock movements"]:[]),"Balanced accounting and audit record",...(prior?["Reverse previous accounting effects; retain revision history"]:[])];
 if(issues.length)return {doc,issues:[...new Set(issues)],duplicate:false,statements:[],effects};
 let journalId=prior?.journal_id||null;
 const oldJournal=prior?.journal_id?await raw.prepare("SELECT account_code,account_name,debit_paise,credit_paise FROM journal_lines WHERE owner_user_id=? AND entry_id=?").bind(owner,prior.journal_id).all<{account_code:string;account_name:string;debit_paise:number;credit_paise:number}>():null;
 if(oldJournal?.results.length&&!priorDoc?.cancelled){const reversal=await prepareJournal({ownerUserId:owner,actor,entryDate:doc.date,sourceType:"tally_reversal",sourceId:key+":"+revision,description:"Tally correction of "+doc.number,lines:oldJournal.results.map(l=>({accountCode:l.account_code,accountName:l.account_name,debitPaise:l.credit_paise,creditPaise:l.debit_paise}))});statements.push(...reversal.statements);}
 // Every receivable/payable line carries the customer or supplier it belongs to (not just the voucher's
 // main party): journals, receipts and adjustments move individual customers' balances too, and the
 // per-customer receivable/payable figures are read from these lines.
 const journalLines:BookLine[]=[];
 for(const line of parsed.lines){
  const {ledgerName,...rest}=line;
  if(ledgerName&&(line.accountCode==="1100"||line.accountCode==="2000")){
   const isCustomer=line.accountCode==="1100",list=isCustomer?customers.results:suppliers.results;
   const known=list.find(r=>r.name===ledgerName);
   const id=known?.id||"tp-"+(await digest(owner+":"+(isCustomer?"customer":"supplier")+":"+ledgerName)).slice(0,40);
   if(!known)statements.push(isCustomer?raw.prepare("INSERT OR IGNORE INTO customers(id,owner_user_id,display_name,primary_phone,gst_registration_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id,owner,ledgerName,"","unregistered",now,now):raw.prepare("INSERT OR IGNORE INTO suppliers(id,owner_user_id,name,primary_phone,gst_registration_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id,owner,ledgerName,"","unregistered",now,now));
   journalLines.push({...rest,partyType:isCustomer?"customer":"supplier",partyId:id,partyName:ledgerName});
  }else journalLines.push(rest);
 }
 if(!doc.cancelled&&!legacy){const journal=await prepareJournal({ownerUserId:owner,actor,entryDate:doc.date,sourceType:"tally_import",sourceId:key+":"+revision,description:`Tally ${doc.type} ${doc.number} · ${doc.narration}`,lines:journalLines});journalId=journal.id;statements.push(...journal.statements);}else if(legacy)journalId=legacy.id;
 const recordId=crypto.randomUUID();
 statements.unshift(raw.prepare("INSERT INTO tally_import_receipts(id,owner_user_id,source_key,created_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),owner,key+":after:"+(prior?.revision||"new"),now));
 statements.push(raw.prepare("INSERT INTO tally_documents(id,owner_user_id,guid,revision,kind,local_id,journal_id,payload,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(recordId,owner,doc.guid,revision,doc.type,id,journalId,JSON.stringify(doc),now));
 if(sale){
  // A sale whose "party" is literally the Cash ledger (partyCode 1000) is settled at the
  // point of sale — Tally never carries it as a receivable, so recording it as an "unpaid"
  // invoice against a customer named "Cash" would wrongly surface it in reminder queues.
  const cashSale=partyCode==="1000",paidPaise=cashSale&&!doc.cancelled?total:0,invoiceStatus=doc.cancelled?"cancelled":cashSale?"paid":"unpaid";
  statements.push(raw.prepare("INSERT INTO invoices(id,owner_user_id,invoice_number,invoice_date,due_date,customer_id,customer_name,customer_gstin,customer_address,place_of_supply,supply_type,subtotal_paise,cgst_paise,sgst_paise,igst_paise,cess_paise,total_paise,paid_paise,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date,customer_name=excluded.customer_name,customer_id=excluded.customer_id,customer_gstin=excluded.customer_gstin,subtotal_paise=excluded.subtotal_paise,cgst_paise=excluded.cgst_paise,sgst_paise=excluded.sgst_paise,igst_paise=excluded.igst_paise,cess_paise=excluded.cess_paise,total_paise=excluded.total_paise,status=CASE WHEN excluded.status='cancelled' THEN 'cancelled' WHEN excluded.status='paid' THEN 'paid' WHEN invoices.paid_paise>=excluded.total_paise THEN 'paid' WHEN invoices.paid_paise>0 THEN 'part_paid' ELSE 'unpaid' END,notes=excluded.notes").bind(id,owner,await uniqueNumber("invoices","invoice_number"),doc.date,partyLine?.bills[0]?.dueDate||doc.date,partyId,partyName,doc.gstin||null,doc.address||null,doc.placeOfSupply||null,igst?"inter_state":"intra_state",total-taxTotal,cgst,sgst,igst,cess,total,paidPaise,invoiceStatus,doc.narration,now));
  statements.push(raw.prepare("DELETE FROM invoice_items WHERE owner_user_id=? AND invoice_id=?").bind(owner,id));
  if(!doc.items.length&&!doc.cancelled)statements.push(raw.prepare("INSERT INTO invoice_items(id,invoice_id,owner_user_id,description,quantity_milli,unit,rate_paise,gst_rate_basis_points,taxable_paise,tax_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,owner,doc.narration||"Tally accounting invoice",1000,"NOS",total-taxTotal,total>taxTotal?Math.round((taxTotal-cess)*10000/(total-taxTotal)):0,total-taxTotal,taxTotal,total,0));
 }else if(purchase){
  statements.push(raw.prepare("INSERT INTO purchases(id,owner_user_id,purchase_number,supplier_id,supplier_name,supplier_gstin,supplier_invoice_number,purchase_date,subtotal_paise,gst_paise,total_paise,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET purchase_number=excluded.purchase_number,supplier_id=excluded.supplier_id,supplier_name=excluded.supplier_name,supplier_gstin=excluded.supplier_gstin,purchase_date=excluded.purchase_date,subtotal_paise=excluded.subtotal_paise,gst_paise=excluded.gst_paise,total_paise=excluded.total_paise,status=excluded.status,notes=excluded.notes").bind(id,owner,await uniqueNumber("purchases","purchase_number"),partyId,partyName,doc.gstin||null,doc.number,doc.date,total-taxTotal,taxTotal,total,doc.cancelled?"cancelled":"received",doc.narration,now));
  statements.push(raw.prepare("DELETE FROM purchase_items WHERE owner_user_id=? AND purchase_id=?").bind(owner,id));
 }
 // Append compensating stock movements instead of erasing stock history.
 if(prior){const previous=await raw.prepare("SELECT product_id,unit,SUM(quantity_milli) quantity,SUM(total_value_paise) value FROM stock_movements WHERE owner_user_id=? AND reference=? GROUP BY product_id,unit").bind(owner,key).all<{product_id:string;unit:string;quantity:number;value:number}>();for(const row of previous.results)if(row.quantity)statements.push(raw.prepare("INSERT INTO stock_movements(id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,total_value_paise,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,row.product_id,"tally_reversal",doc.date,-row.quantity,row.unit,-row.value,key,"Reversal before Tally revision",now));}
 if(!doc.cancelled){let position=0;for(const item of itemRows){
  const amount=Math.abs(item.amount);if(sale)statements.push(raw.prepare("INSERT INTO invoice_items(id,invoice_id,owner_user_id,product_id,description,hsn_sac,quantity_milli,unit,rate_paise,gst_rate_basis_points,taxable_paise,tax_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,owner,item.productId,item.name,item.hsn||null,item.qty,item.unit,item.rate,item.gstRate,amount,item.itemTax,amount+item.itemTax,position));
  if(purchase)statements.push(raw.prepare("INSERT INTO purchase_items(id,purchase_id,owner_user_id,product_id,description,quantity_milli,unit,unit_cost_paise,gst_rate_basis_points,taxable_paise,gst_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,owner,item.productId,item.name,item.qty,item.unit,item.rate,item.gstRate,amount,item.itemTax,amount+item.itemTax,position));
  const signed=(sale||debit)?-item.qty:item.qty;
  statements.push(raw.prepare("INSERT INTO stock_movements(id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,item.productId,"tally_"+type.replaceAll(" ","_"),doc.date,signed,item.unit,item.cost,Math.round(signed*item.cost/1000),key,doc.narration,now));position++;
 }}
 const oldBatches=await raw.prepare("SELECT batch_id,quantity_milli FROM tally_batch_effects WHERE owner_user_id=? AND document_id=?").bind(owner,id).all<{batch_id:string;quantity_milli:number}>();
 for(const batch of oldBatches.results)statements.push(raw.prepare("UPDATE inventory_batches SET quantity_milli=quantity_milli-?,updated_at=? WHERE id=? AND owner_user_id=?").bind(batch.quantity_milli,now,batch.batch_id,owner));
 statements.push(raw.prepare("DELETE FROM tally_batch_effects WHERE owner_user_id=? AND document_id=?").bind(owner,id));
 if(!doc.cancelled)for(const item of itemRows)for(const batch of item.batches){
  const warehouseId="tw-"+(await digest(owner+":"+batch.warehouse)).slice(0,40);
  const batchId="tb-"+(await digest(owner+":"+item.productId+":"+batch.warehouse+":"+batch.name)).slice(0,40);
  const qty=(sale||debit)?-Math.abs(batch.milli):Math.abs(batch.milli);
  statements.push(raw.prepare("INSERT OR IGNORE INTO warehouses(id,owner_user_id,code,name,created_at) VALUES (?,?,?,?,?)").bind(warehouseId,owner,warehouseId,batch.warehouse,now));
  statements.push(raw.prepare("INSERT INTO inventory_batches(id,owner_user_id,product_id,product_name,warehouse_id,warehouse_name,batch_number,manufactured_date,expiry_date,quantity_milli,unit,unit_cost_paise,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET quantity_milli=inventory_batches.quantity_milli+excluded.quantity_milli,manufactured_date=COALESCE(excluded.manufactured_date,inventory_batches.manufactured_date),expiry_date=COALESCE(excluded.expiry_date,inventory_batches.expiry_date),updated_at=excluded.updated_at").bind(batchId,owner,item.productId,item.name,warehouseId,batch.warehouse,batch.name,batch.manufactured||null,batch.expiry||null,qty,item.unit,item.cost,now,now));
  statements.push(raw.prepare("INSERT INTO tally_batch_effects(id,owner_user_id,document_id,batch_id,quantity_milli) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),owner,id,batchId,qty));
 }
 if(credit||debit)statements.push(raw.prepare("INSERT INTO adjustment_documents(id,owner_user_id,document_number,document_type,document_date,original_reference,party_id,party_name,quantity_milli,taxable_paise,gst_paise,total_paise,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document_date=excluded.document_date,taxable_paise=excluded.taxable_paise,gst_paise=excluded.gst_paise,total_paise=excluded.total_paise,status=excluded.status,reason=excluded.reason").bind(id,owner,await uniqueNumber("adjustment_documents","document_number"),credit?"credit_note":"debit_note",doc.date,partyLine?.bills[0]?.reference||null,partyId,partyName,itemRows.reduce((sum,i)=>sum+i.qty,0),total-taxTotal,taxTotal,total,doc.narration||"Imported Tally correction",doc.cancelled?"cancelled":"posted",now));
 if(receipt){const oldRows=await raw.prepare("SELECT invoice_id,SUM(amount_paise) amount FROM invoice_payments WHERE owner_user_id=? AND reference=? GROUP BY invoice_id").bind(owner,key).all<{invoice_id:string;amount:number}>();for(const old of oldRows.results)statements.push(raw.prepare("UPDATE invoices SET paid_paise=MAX(0,paid_paise-?),status=CASE WHEN paid_paise-?<=0 THEN 'unpaid' ELSE 'part_paid' END WHERE id=? AND owner_user_id=?").bind(old.amount,old.amount,old.invoice_id,owner));statements.push(raw.prepare("DELETE FROM invoice_payments WHERE owner_user_id=? AND reference=?").bind(owner,key));for(const bill of linkedBills){statements.push(raw.prepare("INSERT INTO invoice_payments(id,owner_user_id,invoice_id,invoice_number,customer_name,payment_date,amount_paise,payment_mode,reference,journal_entry_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,bill.invoiceId,bill.reference,partyName,doc.date,bill.amount,"tally",key,journalId!,now),raw.prepare("UPDATE invoices SET paid_paise=paid_paise+?,status=CASE WHEN paid_paise+?>=total_paise THEN 'paid' ELSE 'part_paid' END WHERE id=? AND owner_user_id=?").bind(bill.amount,bill.amount,bill.invoiceId,owner));}
  statements.push(raw.prepare("DELETE FROM payment_advances WHERE owner_user_id=? AND reference=?").bind(owner,key));
  for(const bill of advanceBills)if(!doc.cancelled)statements.push(raw.prepare("INSERT INTO payment_advances(id,owner_user_id,advance_type,party_id,party_name,advance_date,amount_paise,payment_mode,reference,purpose,status,created_at,updated_at) VALUES (?,?,'customer_received',?,?,?,?,'tally',?,?,'active',?,?)").bind(crypto.randomUUID(),owner,partyId,partyName,doc.date,bill.amount,key,"Tally on-account receipt: "+bill.reference,now,now));
 }
 statements.push(raw.prepare("DELETE FROM tally_bill_allocations WHERE owner_user_id=? AND document_id=?").bind(owner,id));
 if(!doc.cancelled)for(const bill of partyLine?.bills||[])statements.push(raw.prepare("INSERT INTO tally_bill_allocations(id,owner_user_id,document_id,party_id,party_type,reference,amount_paise,allocation_type,date) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),owner,id,partyId,customerKind?"customer":"supplier",bill.reference,bill.amount,bill.type,doc.date));
 statements.push(raw.prepare("UPDATE tally_transfers SET status='imported',updated_at=? WHERE owner_user_id=? AND direction='in' AND source_key=?").bind(now,owner,doc.guid));
 return {doc,issues:[],duplicate:false,statements,effects};
}
