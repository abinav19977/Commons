import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextEncoder,require(name){return load(path.resolve(path.dirname(file),name)+'.ts');}});return exports;}
const {exportVoucher}=load('app/lib/tally-export.ts'),{parseXml,descendants,documentFromNode}=load('app/lib/tally-document.ts');
const entry={id:'id-one',entry_number:'J-1',entry_date:'2026-09-10',source_type:'sales_invoice',description:'Test sale'};
const line=(code,debit,credit)=>({entry_id:entry.id,account_code:code,account_name:{1100:'Customer money due',4000:'Sales',2100:'GST payable'}[code]||code,tally_ledger:null,debit_paise:debit,credit_paise:credit});
const lines=[line('1100',11800,0),line('4000',0,10000),line('2100',0,1800)];
const source={number:'INV-1',reference:'INV-1',party:'A & B',gstin:'32TEST',cgst:900,sgst:900};
const doc=xml=>documentFromNode(descendants(parseXml(xml),'VOUCHER')[0]);
test('outgoing sales preserve bill references, party identity and exact tax split',()=>{const d=doc(exportVoucher(entry,lines,source));assert.equal(d.number,'INV-1');assert.equal(d.partyName,'A & B');assert.equal(d.ledgers[0].bills[0].reference,'INV-1');assert.equal(d.ledgers[0].bills[0].amount,-11800);assert.deepEqual(Array.from(d.ledgers.filter(l=>l.name.startsWith('Output')).map(l=>l.amount)),[900,900]);assert.equal(d.ledgers.reduce((sum,l)=>sum+l.amount,0),0);});
test('item invoices allocate revenue once and preserve quantity',()=>{const d=doc(exportVoucher(entry,lines,source,[{name:'Sheets',unit:'PCS',quantity_milli:2000,rate_paise:5000,taxable_paise:10000,hsn:'3920'}]));assert.equal(d.items[0].milli,2000);assert.equal(d.items[0].hsn,'3920');assert.equal(d.ledgers.reduce((sum,l)=>sum+l.amount,0),0);assert.equal(d.ledgers.filter(l=>l.name==='Sales').length,1);});
test('receipt export uses Agst Ref without creating another sale',()=>{const d=doc(exportVoucher({...entry,source_type:'invoice_receipt'},[line('1000',5000,0),line('1100',0,5000)],{number:'R-1',party:'A & B',reference:'INV-1',billType:'Agst Ref'}));assert.equal(d.type,'Receipt');assert.equal(d.ledgers[1].bills[0].type,'Agst Ref');assert.equal(d.ledgers[1].bills[0].amount,5000);});
test('imbalanced exports, tax disagreements and item mismatches fail before producing XML',()=>{assert.throws(()=>exportVoucher(entry,lines.slice(0,2),source),/Unbalanced/);assert.throws(()=>exportVoucher(entry,lines,{...source,cgst:0}),/GST components/);assert.throws(()=>exportVoucher(entry,lines,source,[{name:'Sheets',unit:'PCS',quantity_milli:1000,rate_paise:5000,taxable_paise:5000}]),/Item totals/);});
