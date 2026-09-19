import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { webcrypto } from "node:crypto";
function setup(){
 const db=new DatabaseSync(":memory:");for(const f of fs.readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort())db.exec(fs.readFileSync("drizzle/"+f,"utf8"));
 const raw={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return /^\s*SELECT/i.test(sql)?{results:db.prepare(sql).all(...args),meta:{changes:0}}:{meta:db.prepare(sql).run(...args)};}};},async batch(statements){db.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec("COMMIT");return results;}catch(e){db.exec("ROLLBACK");throw e;}}};
 const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Error,TextEncoder,TextDecoder,Request,Response,URL,Date,crypto:webcrypto,require(name){if(name==="zod")return {z};if(name==="next/server")return {NextResponse:class extends Response{static json(data,opts){return {data,status:opts?.status||200};}}};if(name.endsWith("/company-auth"))return {getChatGPTUser:async()=>({id:"company-one",email:"test@example.test",role:"owner"})};if(name.endsWith("/db"))return {getRawDb:()=>raw};return load(path.resolve(path.dirname(file),name)+".ts");}});return exports;}
 db.prepare("INSERT INTO products(id,owner_user_id,name,unit,purchase_price_paise,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("stock-one","company-one","Sheets","PCS",4000,1,1);
 db.prepare("INSERT INTO products(id,owner_user_id,name,unit,purchase_price_paise,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("stock-two","company-two","Sheets","PCS",4000,1,1);
 const engine=load("app/lib/tally-connected-import.ts");return {db,raw,engine,load,async apply(xml,owner="company-one"){const result=await engine.prepareConnectedImport(owner,"accountant",xml);assert.deepEqual(Array.from(result.issues),[]);if(!result.duplicate)await raw.batch(result.statements);return result;}};
}
function invoice({guid="sale",amount=100,qty=1,cancel=false,type="Sales",rev=1}={}){const purchase=type==="Purchase";return `<VOUCHER><GUID>${guid}</GUID><ALTERID>${rev}</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${guid}</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ISCANCELLED>${cancel?"Yes":"No"}</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>${purchase?amount:-amount}</AMOUNT><BILLALLOCATIONS.LIST><NAME>${guid}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${purchase?amount:-amount}</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>${purchase?"Goods purchased":"Sales"}</LEDGERNAME><AMOUNT>${purchase?-amount:amount}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>${qty} PCS</ACTUALQTY><AMOUNT>${purchase?-amount:amount}</AMOUNT><BATCHALLOCATIONS.LIST><GODOWNNAME>Main</GODOWNNAME><BATCHNAME>Batch-1</BATCHNAME><ACTUALQTY>${qty} PCS</ACTUALQTY><MFDON>20260901</MFDON><EXPIRYPERIOD>20270901</EXPIRYPERIOD></BATCHALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;}
const receipt=(amount=40,rev=1)=>`<VOUCHER><GUID>receipt</GUID><ALTERID>${rev}</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>Receipt 1</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-${amount}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>${amount}</AMOUNT><BILLALLOCATIONS.LIST><NAME>sale</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>${amount}</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST></VOUCHER>`;
test("sales import links invoice, stock, batches, party and balanced books once",async()=>{const s=setup();await s.apply(invoice());await s.apply(invoice());assert.equal(s.db.prepare("SELECT COUNT(*) n FROM invoices").get().n,1);assert.equal(s.db.prepare("SELECT total_paise FROM invoices").get().total_paise,10000);assert.equal(s.db.prepare("SELECT SUM(quantity_milli) n FROM stock_movements").get().n,-1000);assert.equal(s.db.prepare("SELECT quantity_milli FROM inventory_batches").get().quantity_milli,-1000);assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);});
test("TallyPrime's GST-prefixed voucher types (Gst Sales, Gst Purchase) are treated the same as Sales/Purchase",async()=>{const s=setup();await s.apply(invoice().replace('<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>','<VOUCHERTYPENAME>Gst Sales</VOUCHERTYPENAME>'));assert.equal(s.db.prepare("SELECT COUNT(*) n FROM invoices").get().n,1);assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);});
test("revision reverses original books and stock; cancellation retains history",async()=>{const s=setup();await s.apply(invoice());await s.apply(invoice({amount:200,qty:2,rev:2}));assert.equal(s.db.prepare("SELECT total_paise FROM invoices").get().total_paise,20000);assert.equal(s.db.prepare("SELECT SUM(quantity_milli) n FROM stock_movements").get().n,-2000);await s.apply(invoice({amount:200,qty:2,rev:3,cancel:true}));assert.equal(s.db.prepare("SELECT status FROM invoices").get().status,"cancelled");assert.equal(s.db.prepare("SELECT SUM(quantity_milli) n FROM stock_movements").get().n,0);assert.equal(s.db.prepare("SELECT quantity_milli FROM inventory_batches").get().quantity_milli,0);assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines WHERE account_code='4000'").get().n,0);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM tally_documents").get().n,3);});
test("receipts update the same customer bill and corrected receipts replace allocation",async()=>{const s=setup();await s.apply(invoice());await s.apply(receipt());assert.equal(s.db.prepare("SELECT paid_paise FROM invoices").get().paid_paise,4000);await s.apply(receipt(60,2));assert.equal(s.db.prepare("SELECT paid_paise FROM invoices").get().paid_paise,6000);const cancel=await s.engine.prepareConnectedImport("company-one","accountant",invoice({cancel:true,rev:2}));assert.ok(cancel.issues.some(i=>i.includes("Reverse related receipts")));});
test("purchases update supplier, purchase lines and stock in isolated company",async()=>{const s=setup();await s.apply(invoice({guid:"buy",type:"Purchase"}));await s.apply(invoice(),"company-two");assert.equal(s.db.prepare("SELECT SUM(quantity_milli) n FROM stock_movements WHERE owner_user_id='company-one'").get().n,1000);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM purchases WHERE owner_user_id='company-one'").get().n,1);});
test("locked periods and unsupported mappings produce no writes",async()=>{const s=setup();s.db.prepare("INSERT INTO period_locks VALUES (?,?,?,?,?,?,?)").run("lock","company-one","2026-09-01","2026-09-30","closed","accountant",1);const result=await s.engine.prepareConnectedImport("company-one","accountant",invoice());assert.ok(result.issues.some(i=>i.includes("locked")));assert.equal(result.statements.length,0);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM invoices").get().n,0);});

test("item-level accounting allocations import once and reject conflicting duplicate totals",async()=>{const s=setup();const direct='<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST>';const allocation='<ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>';const nested=invoice().replace(direct,"").replace('</ALLINVENTORYENTRIES.LIST>',allocation+'</ALLINVENTORYENTRIES.LIST>');await s.apply(nested);assert.equal(s.db.prepare("SELECT SUM(credit_paise) n FROM journal_lines WHERE account_code='4000'").get().n,10000);const bad=invoice({guid:"conflict"}).replace('</ALLINVENTORYENTRIES.LIST>',allocation.replace('100','200')+'</ALLINVENTORYENTRIES.LIST>');await assert.rejects(()=>s.engine.prepareConnectedImport("company-one","accountant",bad),/disagree/);});
test("repeated allocations cannot overpay one bill",async()=>{const s=setup();await s.apply(invoice());const input=receipt(120).replace('<BILLALLOCATIONS.LIST><NAME>sale</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>120</AMOUNT></BILLALLOCATIONS.LIST>', '<BILLALLOCATIONS.LIST><NAME>sale</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>60</AMOUNT></BILLALLOCATIONS.LIST>'.repeat(2));const result=await s.engine.prepareConnectedImport("company-one","accountant",input);assert.ok(result.issues.some(i=>i.includes("overpay")));assert.equal(result.statements.length,0);});
test("invalid calendar dates, malformed XML and excess precision cannot post",async()=>{const s=setup();for(const input of [invoice().replace('20260909','20260230'),invoice().replace('20260909','20269999'),invoice().replace('<GUID>sale</GUID>','<GUID>sale</BAD>'),invoice().replace('<AMOUNT>100</AMOUNT>','<AMOUNT>100.001</AMOUNT>')])await assert.rejects(()=>s.engine.prepareConnectedImport("company-one","accountant",input));assert.equal(s.db.prepare("SELECT COUNT(*) n FROM journal_entries").get().n,0);});
test("a ledger with no manual mapping resolves automatically from its synced Tally group",async()=>{const s=setup();s.db.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,?,?,?,?)").run("tm1","company-one","ledger","Retail revenue","Sales Accounts",1);await s.apply(invoice().replace('<LEDGERNAME>Sales</LEDGERNAME>','<LEDGERNAME>Retail revenue</LEDGERNAME>'));assert.equal(s.db.prepare("SELECT SUM(credit_paise) n FROM journal_lines WHERE account_code='4000'").get().n,10000);});
test("a stock item synced from Tally's master auto-creates the product instead of blocking the sale",async()=>{const s=setup();s.db.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,unit,gst_rate_basis_points,cost_paise,updated_at) VALUES (?,?,?,?,?,?,?,?)").run("tm2","company-one","stockitem","New Item","PCS",1800,3500,1);await s.apply(invoice({guid:"newitem"}).replace('<STOCKITEMNAME>Sheets</STOCKITEMNAME>','<STOCKITEMNAME>New Item</STOCKITEMNAME>'));assert.equal(s.db.prepare("SELECT unit FROM products WHERE owner_user_id='company-one' AND name='New Item'").get().unit,"PCS");});
test("custom account mapping accepts a four-digit code through the import API",async()=>{const s=setup();const route=s.load('app/api/integrations/tally/import/route.ts');const result=await route.POST(new Request('https://commons.test/api/integrations/tally/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview',xml:invoice().replace('<LEDGERNAME>Sales</LEDGERNAME>','<LEDGERNAME>Retail revenue</LEDGERNAME>'),mappings:{'retail revenue':'4000'}})}));assert.equal(result.status,200);assert.equal(result.data.ready,1);});
test("inventory in a journal needs explicit mapping instead of becoming stock-in",async()=>{const s=setup();const result=await s.engine.prepareConnectedImport('company-one','accountant',invoice({type:'Journal'}));assert.ok(result.issues.some(i=>i.includes('stock movement mapping')));assert.equal(result.statements.length,0);});
test("escaped angle brackets in ledger names remain intact",async()=>{const s=setup();await s.apply(invoice().replaceAll('Example party','A &lt;B&gt;'));assert.equal(s.db.prepare('SELECT display_name FROM customers').get().display_name,'A <B>');});

const saleWithRoundOff=(partyAmount,roundAmount)=>`<VOUCHER><GUID>round-off</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>round-off</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>${partyAmount}</AMOUNT><BILLALLOCATIONS.LIST><NAME>round-off</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${partyAmount}</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>ROUND OFF</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>${roundAmount}</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>100</AMOUNT><BATCHALLOCATIONS.LIST><GODOWNNAME>Main</GODOWNNAME><BATCHNAME>Batch-1</BATCHNAME><ACTUALQTY>1 PCS</ACTUALQTY><MFDON>20260901</MFDON><EXPIRYPERIOD>20270901</EXPIRYPERIOD></BATCHALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
test("TallyPrime's ISDEEMEDPOSITIVE convention for Round Off does not flag a real, balanced voucher",async()=>{
 const s=setup();
 // Real Tally exports show ISDEEMEDPOSITIVE="No" for ROUND OFF regardless of whether this
 // instance is a small debit (-0.44) or credit (+0.20) adjustment -- confirmed against a
 // live company. -99.56 party + 100 sales + (-0.44) round off = balanced at 100.
 const result=await s.engine.prepareConnectedImport("company-one","accountant",saleWithRoundOff("-99.56","-0.44"),{"round off":"6000"});
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);
 assert.equal(s.db.prepare("SELECT debit_paise FROM journal_lines WHERE account_code='6000'").get().debit_paise,44);
});
test("a genuinely mismatched (non-rounding) ledger still gets flagged for sign disagreement",async()=>{
 const s=setup();
 const bad=saleWithRoundOff("-99.56","-0.44").replace("ROUND OFF","Freight Charges");
 const result=await s.engine.prepareConnectedImport("company-one","accountant",bad,{"freight charges":"6000"});
 assert.ok(result.issues.some(i=>i.includes("sign disagrees")));
});

test("a discount ledger reducing the party total below item+tax no longer blocks the sale",async()=>{
 const s=setup();
 // item 100 + tax 0 - discount 5 = party 95; the voucher is fully balanced, it just has a
 // ledger line (Discount Allowed) that itemTotal+taxTotal alone don't account for.
 const xml=`<VOUCHER><GUID>discount</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>discount</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>-95</AMOUNT><BILLALLOCATIONS.LIST><NAME>discount</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-95</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Discount Allowed</LEDGERNAME><AMOUNT>-5</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>100</AMOUNT><BATCHALLOCATIONS.LIST><GODOWNNAME>Main</GODOWNNAME><BATCHNAME>Batch-1</BATCHNAME><ACTUALQTY>1 PCS</ACTUALQTY><MFDON>20260901</MFDON><EXPIRYPERIOD>20270901</EXPIRYPERIOD></BATCHALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
 const result=await s.engine.prepareConnectedImport("company-one","accountant",xml,{"discount allowed":"6000"});
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);
});

test("per-item GST rounded independently across several items is allowed a small tolerance against the voucher tax total",async()=>{
 const s=setup();
 // item tax sums to 1206 (594+612) but the voucher's own IGST ledger reads 1207 -- a
 // single paisa of rounding drift that should no longer block a real, balanced voucher.
 const xml=`<VOUCHER><GUID>tax-round</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>tax-round</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>-79.07</AMOUNT><BILLALLOCATIONS.LIST><NAME>tax-round</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-79.07</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>67</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Output IGST</LEDGERNAME><AMOUNT>12.07</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>33</AMOUNT><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE>18</GSTRATE></RATEDETAILS.LIST></ALLINVENTORYENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>34</AMOUNT><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE>18</GSTRATE></RATEDETAILS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
 const result=await s.engine.prepareConnectedImport("company-one","accountant",xml);
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);
});

test("a receipt with an on-account bill type (not yet matched to a bill) is tracked as an advance instead of blocked",async()=>{
 const s=setup();
 await s.apply(invoice());
 const onAccount=receipt(40).replace("Agst Ref","New Ref");
 const result=await s.engine.prepareConnectedImport("company-one","accountant",onAccount);
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT paid_paise FROM invoices").get().paid_paise,0);
 const advance=s.db.prepare("SELECT party_name,amount_paise,status FROM payment_advances WHERE owner_user_id='company-one'").get();
 assert.equal(advance.party_name,"Example party");assert.equal(advance.amount_paise,4000);assert.equal(advance.status,"active");
});

test("a receipt with a completely empty bill-allocation list (confirmed real Tally pattern) is tracked as an unallocated advance instead of blocked forever",async()=>{
 const s=setup();
 await s.apply(invoice());
 // Real Tally export: <BILLALLOCATIONS.LIST>      </BILLALLOCATIONS.LIST> -- whitespace
 // only, no NAME/TYPE/AMOUNT children at all, which documentFromNode correctly treats as
 // "no bill data", not a malformed one.
 const unallocated=receipt(40).replace('<BILLALLOCATIONS.LIST><NAME>sale</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>40</AMOUNT></BILLALLOCATIONS.LIST>','<BILLALLOCATIONS.LIST>      </BILLALLOCATIONS.LIST>');
 const result=await s.engine.prepareConnectedImport("company-one","accountant",unallocated);
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT paid_paise FROM invoices").get().paid_paise,0);
 const advance=s.db.prepare("SELECT party_name,amount_paise,status FROM payment_advances WHERE owner_user_id='company-one'").get();
 assert.equal(advance.party_name,"Example party");assert.equal(advance.amount_paise,4000);assert.equal(advance.status,"active");
});

test("master exports omit openings by default and preserve receivable/payable signs when requested",async()=>{const s=setup();s.db.prepare("INSERT INTO customers(id,owner_user_id,display_name,primary_phone,opening_balance_paise,balance_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run('c1','company-one','Debit customer','',10000,'receivable',1,1);s.db.prepare("INSERT INTO customers(id,owner_user_id,display_name,primary_phone,opening_balance_paise,balance_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run('c2','company-one','Credit customer','',20000,'payable',1,1);s.db.prepare("INSERT INTO suppliers(id,owner_user_id,name,primary_phone,opening_payable_paise,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run('s1','company-one','Supplier','',30000,1,1);const route=s.load('app/api/integrations/tally/export/route.ts');const ordinary=await (await route.GET(new Request('https://commons.test/api/integrations/tally/export?scope=masters'))).text();assert.doesNotMatch(ordinary,/<OPENINGBALANCE>-?(100|200|300)\.00</);const included=await (await route.GET(new Request('https://commons.test/api/integrations/tally/export?scope=masters&openings=include'))).text();assert.match(included,/<OPENINGBALANCE>-100\.00</);assert.match(included,/<OPENINGBALANCE>200\.00</);assert.match(included,/<OPENINGBALANCE>300\.00</);});
test("company backup includes Tally history, excludes other companies and supports guarded restore",async()=>{const s=setup();await s.apply(invoice());await s.apply(invoice({guid:'other'}),'company-two');const route=s.load('app/api/accounts/controls/route.ts');const response=await route.GET(new Request('https://commons.test/api/accounts/controls'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.format,'commons-backup-v3');assert.equal(body.restoreSupported,true);assert.equal(body.data.tally_documents.length,1);assert.equal(body.data.tally_documents[0].owner_user_id,'company-one');assert.equal(body.dataSha256.length,64);assert.equal(body.data.tally_bridges,undefined);assert.ok(Array.isArray(body.data.employees));assert.ok(Array.isArray(body.data.purchase_payments));});
test("failed voucher preview retains identity and leaves accounting unchanged",async()=>{
 const s=setup();const route=s.load('app/api/integrations/tally/import/route.ts');
 const xml=invoice({guid:'missing-amount'}).replace('<AMOUNT>-100</AMOUNT>','');
 const response=await route.POST(new Request('https://commons.test/api/integrations/tally/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview',xml})}));
 assert.equal(response.data.vouchers[0].date,'2026-09-09');
 assert.equal(response.data.vouchers[0].number,'missing-amount');
 assert.match(response.data.vouchers[0].issues[0],/Required amount/);
 assert.equal(response.data.ready,0);
});

test("a cash sale (party IS the Cash ledger, which auto-maps to its own code) is not double-counted against itself",async()=>{
 const s=setup();
 // Confirmed on a real voucher: Cash resolves to code 1000 (Cash-in-Hand) via its own
 // group mapping, not the usual 1100 assumed for a "party" -- without excluding whichever
 // code the party actually resolves to, this line got counted both as the party total and
 // again as an "other" ledger, off by exactly the Cash amount.
 s.db.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,?,?,?,?)").run("tm-cash","company-one","ledger","Cash","Cash-in-Hand",1);
 const xml=`<VOUCHER><GUID>cash-sale</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>cash-sale</VOUCHERNUMBER><PARTYLEDGERNAME>Cash</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-100.44</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>ROUND OFF</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>0.44</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>100</AMOUNT><BATCHALLOCATIONS.LIST><GODOWNNAME>Main</GODOWNNAME><BATCHNAME>Batch-1</BATCHNAME><ACTUALQTY>1 PCS</ACTUALQTY><MFDON>20260901</MFDON><EXPIRYPERIOD>20270901</EXPIRYPERIOD></BATCHALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
 const result=await s.engine.prepareConnectedImport("company-one","accountant",xml,{"round off":"6000"});
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);
 // A cash sale settles instantly -- it must never sit in the invoice table as an
 // outstanding receivable against a "customer" literally named Cash, which would
 // otherwise surface it in the overdue-reminder queue.
 const posted=s.db.prepare("SELECT status,paid_paise,total_paise FROM invoices WHERE owner_user_id='company-one'").get();
 assert.equal(posted.status,"paid");
 assert.equal(posted.paid_paise,posted.total_paise);
});

test("a purchase with a Round Off line (party credited, opposite direction from a sale) reconciles correctly",async()=>{
 const s=setup();
 // The item+tax+other reconciliation must flip sign depending on which side the party is
 // on: a sale's party is debited (discount/round-off adds to what's owed), a purchase's
 // party is credited (the opposite) -- confirmed against a real purchase voucher with a
 // Round Off line that the un-signed version of this check got backwards.
 const xml=`<VOUCHER><GUID>purchase-round</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><VOUCHERNUMBER>purchase-round</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>100.50</AMOUNT><BILLALLOCATIONS.LIST><NAME>purchase-round</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>100.50</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Goods purchased</LEDGERNAME><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>ROUND OFF</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>-0.50</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>-100</AMOUNT><BATCHALLOCATIONS.LIST><GODOWNNAME>Main</GODOWNNAME><BATCHNAME>Batch-1</BATCHNAME><ACTUALQTY>1 PCS</ACTUALQTY><MFDON>20260901</MFDON><EXPIRYPERIOD>20270901</EXPIRYPERIOD></BATCHALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
 const result=await s.engine.prepareConnectedImport("company-one","accountant",xml,{"round off":"6000"});
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);
});

test("a sales ledger literally named with 'IGST' in it (e.g. IGST Sales 18%) is not mistaken for the tax ledger itself",async()=>{
 const s=setup();
 // Confirmed on a real voucher: the loose "name contains 'igst'" match for finding the tax
 // ledger also matched the SALES ledger (named "IGST Sales 18%"), double-counting the sale
 // as its own tax. Only a ledger that doesn't resolve to the sales/purchase code should count.
 s.db.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,?,?,?,?)").run("tm-igst-sales","company-one","ledger","IGST Sales 18%","Sales Accounts",1);
 s.db.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,?,?,?,?)").run("tm-igst-tax","company-one","ledger","IGST","Duties & Taxes",1);
 const xml=`<VOUCHER><GUID>igst-name-collision</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>igst-name-collision</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>-118</AMOUNT><BILLALLOCATIONS.LIST><NAME>igst-name-collision</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-118</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST Sales 18%</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>IGST</LEDGERNAME><AMOUNT>18</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>1 PCS</ACTUALQTY><AMOUNT>100</AMOUNT><RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATE>18</GSTRATE></RATEDETAILS.LIST><BATCHALLOCATIONS.LIST><GODOWNNAME>Main</GODOWNNAME><BATCHNAME>Batch-1</BATCHNAME><ACTUALQTY>1 PCS</ACTUALQTY><MFDON>20260901</MFDON><EXPIRYPERIOD>20270901</EXPIRYPERIOD></BATCHALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
 const result=await s.engine.prepareConnectedImport("company-one","accountant",xml);
 assert.deepEqual(Array.from(result.issues),[]);
 await s.raw.batch(result.statements);
 assert.equal(s.db.prepare("SELECT igst_paise FROM invoices").get().igst_paise,1800);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise-credit_paise) n FROM journal_lines").get().n,0);
});

test("two vouchers for the same brand-new party import together in one batch (bulk import)",async()=>{
 const s=setup();
 // The bulk importer prepares 25 vouchers before executing any of them, so both see no
 // existing customer/product and both try to create it -- that used to abort the whole
 // batch with a customers.id primary-key violation.
 const a=await s.engine.prepareConnectedImport("company-one","accountant",invoice({guid:"bulk-a"}));
 const b=await s.engine.prepareConnectedImport("company-one","accountant",invoice({guid:"bulk-b"}));
 assert.deepEqual(Array.from(a.issues),[]);assert.deepEqual(Array.from(b.issues),[]);
 await s.raw.batch([...a.statements,...b.statements]);
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM customers").get().n,1);
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM invoices").get().n,2);
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM products WHERE owner_user_id='company-one'").get().n,1);
});

test("Tally voucher numbers that repeat (other financial year or series) import with a suffix instead of failing",async()=>{
 const s=setup();
 // Tally restarts numbering each year/series, but Commons keeps purchase and invoice
 // numbers unique per company; the second voucher used to abort with a UNIQUE violation.
 await s.apply(invoice({guid:"p1",type:"Purchase"}));
 await s.apply(invoice({guid:"p2",type:"Purchase"}).replace("<VOUCHERNUMBER>p2<","<VOUCHERNUMBER>p1<"));
 const purchases=s.db.prepare("SELECT purchase_number n FROM purchases WHERE owner_user_id='company-one' ORDER BY purchase_number").all().map(r=>r.n);
 assert.equal(purchases.length,2);assert.equal(purchases[0],"p1");assert.ok(/^p1~[0-9a-f]{6}$/.test(purchases[1]));
 // A revision of the suffixed voucher keeps the same number rather than clashing again.
 await s.apply(invoice({guid:"p2",type:"Purchase",amount:150,rev:2}).replace("<VOUCHERNUMBER>p2<","<VOUCHERNUMBER>p1<"));
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM purchases WHERE owner_user_id='company-one'").get().n,2);
 // Same for sales invoices (separate company so the party is only a customer).
 const t=setup();
 await t.apply(invoice({guid:"s1"}));
 await t.apply(invoice({guid:"s2"}).replace("<VOUCHERNUMBER>s2<","<VOUCHERNUMBER>s1<"));
 assert.equal(t.db.prepare("SELECT COUNT(DISTINCT invoice_number) n FROM invoices WHERE owner_user_id='company-one'").get().n,2);
});

test("an account the user chose for an unclassified ledger is remembered and lets its vouchers import",async()=>{
 const s=setup();
 const journal=`<VOUCHER><GUID>petty-1</GUID><ALTERID>1</ALTERID><DATE>20260909</DATE><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><ISCANCELLED>No</ISCANCELLED><ALLLEDGERENTRIES.LIST><LEDGERNAME>Petty Cash</LEDGERNAME><AMOUNT>-50</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>50</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>`;
 const before=await s.engine.prepareConnectedImport("company-one","accountant",journal);
 assert.ok(before.issues.some(i=>i.includes("Petty Cash")));
 // Saved as kind 'mapping' (not 'ledger') so a later master sync cannot overwrite it.
 s.db.prepare("INSERT INTO tally_masters(id,owner_user_id,kind,name,top_group,updated_at) VALUES (?,?,?,?,?,?)").run("m1","company-one","mapping","Petty Cash","1000",1);
 const after=await s.engine.prepareConnectedImport("company-one","accountant",journal);
 assert.deepEqual(Array.from(after.issues),[]);
 await s.raw.batch(after.statements);
 assert.equal(s.db.prepare("SELECT SUM(debit_paise) n FROM journal_lines WHERE account_code='1000'").get().n,5000);
});

test("broad Tally groups and TDS/GST names resolve to Commons accounts without a manual choice",()=>{
 const s=setup();const {resolveMasterLedgerCode:r}=s.load("app/lib/tally.ts");
 assert.equal(r("Rent Payable","Current Liabilities"),"2330");
 assert.equal(r("Yes Bank Car Loan","Secured Loans"),"2400");
 assert.equal(r("Federal Bank Deposit","Deposits (Asset)"),"1600");
 assert.equal(r("TDS AY 2025 - 26","Current Assets"),"1430");
 assert.equal(r("TDS on Rent","Duties & Taxes"),"2320");
 assert.equal(r("Input Tax RCM","Duties & Taxes"),"1300");
 assert.equal(r("Gst Paid","Duties & Taxes"),"2100");
 assert.equal(r("Some Advance","Current Assets"),"1420");
 assert.equal(r("Unknown","Suspense A/c"),undefined);
 assert.equal(r("Petty Cash","Cash-in-Hand"),"1000");
});

test("reconciliation compares Tally's closing balance with opening + imported vouchers, ledger by ledger",()=>{
 const s=setup();const {reconcileLedgers}=s.load("app/lib/tally-reconcile.ts");
 // Tally convention: negative = debit. Bank opened at 1,000 Dr and received 500 Dr in a voucher.
 const masters=[{name:"Bank",group:"Bank Accounts",opening:-100000,closing:-150000},{name:"Sales",group:"Sales Accounts",opening:0,closing:50000},{name:"Rent",group:"Indirect Expenses",opening:0,closing:-20000}];
 const vouchers=[{name:"Bank",amount:-50000},{name:"sales ",amount:50000},{name:"Rent",amount:-10000}];
 const withOpening=reconcileLedgers(masters,vouchers,true);
 assert.equal(withOpening.checked,3);assert.equal(withOpening.matched,2);assert.equal(withOpening.differing,1);
 assert.equal(withOpening.rows[0].name,"Rent");assert.equal(withOpening.rows[0].diff,-10000);
 // Without the opening entry posted, Bank is short by exactly its opening balance.
 const without=reconcileLedgers(masters,vouchers,false);
 assert.ok(without.rows.some(r=>r.name==="Bank"&&r.diff===-100000));
});

test("opening-balance entry always balances, keeps debtor/creditor parties, and parks unmapped ledgers in opening equity",()=>{
 const s=setup();const {openingEntry}=s.load("app/lib/tally-reconcile.ts");
 const masters=[
  {name:"Cash",group:"Cash-in-Hand",opening:-30000,closing:null},
  {name:"Capital",group:"Capital Account",opening:100000,closing:null},
  {name:"Om Traders",group:"Sundry Debtors",opening:-50000,closing:null},
  {name:"Mystery",group:"Suspense A/c",opening:-20000,closing:null},
  {name:"Kerala Polymers",group:"Sundry Creditors",opening:0,closing:null}];
 const plan=openingEntry(masters,(name,group)=>({"Cash":{code:"1000",name:"Cash in hand"},"Capital":{code:"3000",name:"Owner's capital"},"Om Traders":{code:"1100",name:"Customer money due",party:{type:"customer",id:"p1",name:"Om Traders"}}}[name]));
 assert.equal(plan.ledgers,4);assert.equal(plan.unmapped.length,1);assert.equal(plan.unmapped[0].name,"Mystery");
 const debit=plan.lines.reduce((t,l)=>t+l.debitPaise,0),credit=plan.lines.reduce((t,l)=>t+l.creditPaise,0);
 assert.equal(debit,credit);
 assert.ok(plan.lines.some(l=>l.accountCode==="1100"&&l.partyId==="p1"&&l.debitPaise===50000));
 // Tally openings that don't net to zero are balanced through Opening balance equity, never dropped.
 const lopsided=openingEntry([{name:"Cash",group:"Cash-in-Hand",opening:-30000,closing:null}],()=>({code:"1000",name:"Cash in hand"}));
 assert.equal(lopsided.balancingPaise,30000);
 assert.equal(lopsided.lines.reduce((t,l)=>t+l.debitPaise,0),lopsided.lines.reduce((t,l)=>t+l.creditPaise,0));
});

test("opening balances are derived from Tally's closing minus imported vouchers, and unexplained income/expense is flagged",()=>{
 const s=setup();const {deriveOpenings}=s.load("app/lib/tally-reconcile.ts");
 // Bank opened 1,000 Dr, vouchers moved 500 Dr, so Tally's closing is 1,500 Dr.
 const masters=[
  {name:"Bank",group:"Bank Accounts",opening:null,closing:-150000},
  {name:"Sales",group:"Sales Accounts",opening:null,closing:80000},
  {name:"Rent",group:"Indirect Expenses",opening:null,closing:-20000},
  {name:"Loan",group:"Loans (Liability)",opening:null,closing:300000},
  {name:"No balance",group:"Sundry Debtors",opening:null,closing:null}];
 const vouchers=[{name:"Bank",amount:-50000},{name:"sales ",amount:50000},{name:"Rent",amount:-10000}];
 const r=deriveOpenings(masters,vouchers);
 const by=Object.fromEntries(r.masters.map(m=>[m.name,m.opening]));
 assert.equal(by.Bank,-100000);           // 1,500 closing - 500 moved = 1,000 Dr opening
 assert.equal(by.Sales,30000);            // an income ledger should be 0 here...
 assert.equal(by.Rent,-10000);            // ...and so should an expense ledger
 assert.equal(by.Loan,300000);            // no vouchers: the whole balance is opening
 assert.equal(by["No balance"],null);     // nothing from Tally: left alone
 assert.deepEqual(Array.from(r.unexplained.map(u=>u.name)).sort(),["Rent","Sales"]);
 assert.equal(r.unexplainedTotal,40000);
});
