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
