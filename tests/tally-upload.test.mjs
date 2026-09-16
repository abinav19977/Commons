import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
const cache={};
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextEncoder,TextDecoder,require:n=>load(path.resolve(path.dirname(file),n)+'.ts')});return exports;}
const doc=load('app/lib/tally-document.ts'),upload=load('app/lib/tally-upload.ts');
const voucher='<VOUCHER><GUID>test</GUID><DATE>20230403</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>10</AMOUNT><BILLALLOCATIONS.LIST> </BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST></VOUCHER>';
test('empty allocation placeholders are skipped but incomplete real allocations fail',()=>{
 const read=s=>doc.documentFromNode(doc.descendants(doc.parseXml(s),'VOUCHER')[0]);
 assert.equal(read(voucher).ledgers[0].bills.length,0);
 assert.throws(()=>read(voucher.replace('> </BILLALLOCATIONS','><NAME>invoice</NAME></BILLALLOCATIONS')),/Required amount/);
 assert.throws(()=>read(voucher.replace('<AMOUNT>10</AMOUNT>','')),/Required amount/);
});
test('batching retains every voucher and rejects malformed full documents',()=>{
 const batches=upload.splitTallyUpload('<ENVELOPE>'+voucher.repeat(431)+'</ENVELOPE>');
 assert.equal(batches.length,44);
 assert.equal(batches.reduce((n,b)=>n+doc.descendants(doc.parseXml(b),'VOUCHER').length,0),431);
 assert.throws(()=>upload.splitTallyUpload('<ENVELOPE>'+voucher),/Incomplete/);
 assert.throws(()=>upload.splitTallyUpload('<!DOCTYPE a><ENVELOPE>'+voucher+'</ENVELOPE>'),/Unsupported/);
});
test('UTF-16 Tally exports decode correctly',()=>{
 const bytes=Buffer.concat([Buffer.from([255,254]),Buffer.from(voucher,'utf16le')]);
 assert.equal(upload.decodeTallyFile(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),voucher);
});
if(process.env.TALLY_SAMPLE) test('private supplied export: every voucher parses and every batch meets server limits',()=>{
 const data=fs.readFileSync(process.env.TALLY_SAMPLE);
 const xml=upload.decodeTallyFile(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
 const batches=upload.splitTallyUpload(xml);let count=0;
 for(const b of batches)for(const node of doc.descendants(doc.parseXml(b),'VOUCHER')){doc.documentFromNode(node);count++;}
 assert.equal(count,431);assert.equal(batches.length,44);
});
