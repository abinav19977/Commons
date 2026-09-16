import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
function setup(){
 const db=new DatabaseSync(":memory:");for(const file of fs.readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort())db.exec(fs.readFileSync("drizzle/"+file,"utf8"));
 const raw={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};}};
 let helpers;
 function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextEncoder,TextDecoder,Request,Date,crypto:webcrypto,require(name){
  if(name.endsWith("/db"))return {getRawDb:()=>raw};if(name.endsWith("tally-bridge"))return helpers;if(name.endsWith("tally-document"))return load("app/lib/tally-document.ts");
  if(name==="next/server")return {NextResponse:{json:(data,opts)=>({data,status:opts?.status||200})}};
  throw Error(name);
 }});return exports;}
 helpers=load("app/lib/tally-bridge.ts");const route=load("app/api/integrations/tally/connector/route.ts");
 const token="a".repeat(64);const call=(body,key=token)=>route.POST(new Request("https://commons.test/api/integrations/tally/connector",{method:"POST",headers:{authorization:"Bearer "+key},body:JSON.stringify({name:"Tally One",guid:"guid-one",protocolVersion:2,...body})}));
 async function seed(){db.prepare("INSERT INTO tally_bridges(id,owner_user_id,tally_name,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)").run("bridge-one","company-one","Tally One",await helpers.digest(token),Date.now()+100000,1);}
 return {db,call,seed,helpers,token};
}
const xml='<VOUCHER><GUID>incoming-one</GUID><VOUCHERNUMBER>ONE</VOUCHERNUMBER></VOUCHER>';
test("machine key is scoped, first GUID pinned, wrong company and revoked key rejected",async()=>{
 const s=setup();await s.seed();assert.equal((await s.call({action:"poll"},"b".repeat(64))).status,401);
 assert.equal((await s.call({action:"poll"})).status,200);
 assert.equal(s.db.prepare("SELECT tally_guid FROM tally_bridges").get().tally_guid,"guid-one");
 assert.equal((await s.call({action:"poll",guid:"different"})).status,409);
 assert.equal((await s.call({action:"poll",name:"Another company"})).status,409);
 s.db.exec("UPDATE tally_bridges SET revoked=1");assert.equal((await s.call({action:"poll"})).status,401);
});
test("incoming duplicates are idempotent and revisions return to review",async()=>{
 const s=setup();await s.seed();await s.call({action:"inbox",xml});await s.call({action:"inbox",xml});
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM tally_transfers").get().n,1);
 await s.call({action:"inbox",xml:xml.replace("ONE","EDITED")});
 const row=s.db.prepare("SELECT * FROM tally_transfers").get();assert.equal(row.status,"review");assert.equal(row.xml,xml.replace("ONE","EDITED"));assert.equal(row.owner_user_id,"company-one");
});
test("atomic claim and acknowledgements cannot touch another company",async()=>{
 const s=setup();await s.seed();s.db.prepare("INSERT INTO tally_transfers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("job-one","company-one","bridge-one","out","voucher-one","JV",xml,"digest","pending",null,1,1);
 const results=await Promise.all([s.call({action:"poll"}),s.call({action:"poll"})]);assert.equal(results.filter(r=>r.data.job).length,1);
 s.db.prepare("INSERT INTO tally_transfers VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("job-two","company-two","bridge-two","out","voucher-two","JV",xml,"digest","sending",null,1,1);
 await s.call({action:"ack",id:"job-two",status:"sent"});assert.equal(s.db.prepare("SELECT status FROM tally_transfers WHERE id='job-two'").get().status,"sending");
 await s.call({action:"ack",id:"job-one",status:"uncertain"});assert.equal((await s.call({action:"poll"})).data.job,null);
});
test("import receipt uniqueness protects against concurrent double posting",()=>{
 const s=setup();s.db.prepare("INSERT INTO tally_import_receipts VALUES (?,?,?,?)").run("one","company-one","guid-one",1);
 assert.throws(()=>s.db.prepare("INSERT INTO tally_import_receipts VALUES (?,?,?,?)").run("two","company-one","guid-one",1));
 s.db.prepare("INSERT INTO tally_import_receipts VALUES (?,?,?,?)").run("three","company-two","guid-one",1);
});
test("malformed, multiple and entity-bearing incoming vouchers are rejected",async()=>{
 const s=setup();await s.seed();assert.equal((await s.call({action:"inbox",xml:xml+xml})).status,400);assert.equal((await s.call({action:"inbox",xml:"<!DOCTYPE x>"+xml})).status,400);
 assert.equal((await s.call({action:"inbox",xml:xml.replace("<GUID>incoming-one</GUID>","")})).status,400);
});

test("outdated connector cannot claim work; expired keys fail",async()=>{const s=setup();await s.seed();assert.equal((await s.call({action:"poll",protocolVersion:1})).status,426);s.db.exec("UPDATE tally_bridges SET expires_at=1");assert.equal((await s.call({action:"poll"})).status,401);});
test("malformed XML and oversized multibyte payloads never reach the inbox",async()=>{const s=setup();await s.seed();assert.equal((await s.call({action:"inbox",xml:xml.replace("</GUID>","</WRONG>")})).status,400);assert.equal((await s.call({action:"inbox",xml:xml.replace("ONE","₹".repeat(30000))})).status,400);assert.equal(s.db.prepare("SELECT COUNT(*) n FROM tally_transfers").get().n,0);});
test("request body reader rejects primitives and enforces actual bytes",async()=>{const s=setup();for(const body of ["null","[]","42","x".repeat(100001)]){await assert.rejects(()=>s.helpers.readBoundedJson(new Request("https://commons.test",{method:"POST",body})));}});
