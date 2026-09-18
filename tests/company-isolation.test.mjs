import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync,readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
import { z } from "zod";

function setup(){
 const db=new DatabaseSync(":memory:");
 for(const f of readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort()) db.exec(readFileSync("drizzle/"+f,"utf8"));
 const state={account:{id:"account-one",email:"one@example.test"},selected:undefined};
 const raw={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};},async batch(items){db.exec("BEGIN");try{const results=[];for(const item of items)results.push(await item.run());db.exec("COMMIT");return results;}catch(e){db.exec("ROLLBACK");throw e;}}};
 const realAuth={getChatGPTUser:async()=>state.account,requireChatGPTUser:async()=>{if(!state.account)throw Error("signin");return state.account;}};
 let auth;
 function module(file){const output=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};vm.runInNewContext(output,{exports,Request,Response,URL,Date,crypto:webcrypto,console:{error(){}},require(name){
   if(name==="next/headers")return {cookies:async()=>({get:()=>state.selected?{value:state.selected}:undefined})};
   if(name==="next/navigation")return {redirect:path=>{throw Error("redirect:"+path);}};
   if(name==="next/server")return {NextResponse:{json(data,options){return {data,status:options?.status||200,cookies:{set(key,value){state.selected=value;}}};}}};
   if(name==="zod")return {z};
   if(name.endsWith("/company-auth"))return auth;
   if(name.endsWith("/chatgpt-auth"))return realAuth;
   if(name.endsWith("/db"))return {getRawDb:()=>raw};
   throw Error(name);
 }});return exports;}
 auth=module("app/company-auth.ts");
 const create=module("app/api/companies/route.ts");const select=module("app/api/companies/select/route.ts");
 const request=(path,body,company)=>new Request("https://commons.test"+path,{method:"POST",headers:{"content-type":"application/json",origin:"https://commons.test",...(company?{"x-commons-company":company}:{})},body:JSON.stringify(body)});
 return {db,state,auth,create,select,request};
}

test("five companies, sixth rejected, separate account has its own allowance",async()=>{
 const s=setup();
 for(let n=1;n<=5;n++){const result=await s.create.POST(s.request("/api/companies",{legalName:"Company "+n,invoicePrefix:"INV",addressLine1:"Address "+n}));assert.equal(result.status,201,JSON.stringify(result.data));}
 assert.equal((await s.auth.listCompanies("account-one")).length,5);
 assert.equal((await s.create.POST(s.request("/api/companies",{legalName:"Sixth",invoicePrefix:"INV"}))).status,409);
 assert.throws(()=>s.db.prepare("INSERT INTO companies VALUES (?,?,?,?)").run("sixth","account-one",6,1));
 s.state.account={id:"account-two",email:"two@example.test"};
 assert.equal((await s.create.POST(s.request("/api/companies",{legalName:"Other account",invoicePrefix:"INV"}))).status,201);
 assert.equal((await s.auth.listCompanies("account-two")).length,1);
 assert.equal(s.db.prepare("SELECT address_line_1 FROM business_profiles WHERE owner_user_id=?").get("account-one").address_line_1,"Address 1");
});

test("legacy company stays attached to its existing records",async()=>{
 const s=setup();s.db.prepare("INSERT INTO business_profiles(owner_user_id,legal_name,updated_at) VALUES (?,?,?)").run("account-one","Original company",1);
 await s.auth.claimLegacyCompany("account-one");await s.auth.claimLegacyCompany("account-one");
 const companies=await s.auth.listCompanies("account-one");assert.equal(companies.length,1);assert.equal(companies[0].id,"account-one");
});

test("server rejects foreign selection, stale tabs, missing pins and cross-company references",async()=>{
 const s=setup();await s.create.POST(s.request("/api/companies",{legalName:"One",invoicePrefix:"INV"}));const first=s.state.selected;
 await s.create.POST(s.request("/api/companies",{legalName:"Two",invoicePrefix:"INV"}));const second=s.state.selected;
 assert.equal(await s.auth.getChatGPTUser(s.request("/api/invoices",{},first)),null);
 assert.equal(await s.auth.getChatGPTUser(s.request("/api/invoices",{})),null);
 assert.equal((await s.auth.getChatGPTUser(s.request("/api/invoices",{},second))).id,second);
 s.db.prepare("INSERT INTO products(id,owner_user_id,name,unit,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("one-product",first,"Private stock","PCS",1,1);
 assert.equal(await s.auth.getChatGPTUser(s.request("/api/invoices",{lines:[{productId:"one-product"}]},second)),null);
 s.state.account={id:"outsider",email:"out@example.test"};assert.equal(await s.auth.getChatGPTUser(),null);
 assert.equal((await s.select.POST(s.request("/api/companies/select",{id:first}))).status,404);
 s.state.account=null;assert.equal(await s.auth.getChatGPTUser(),null);
});

test("every existing business API resolves the company before using data",()=>{
 function scan(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=dir+"/"+entry.name;if(entry.isDirectory())scan(path);else if(path.endsWith("route.ts")&&!path.includes("/companies/")&&!path.includes("/api/auth/")){const source=readFileSync(path,"utf8");if(path==="app/api/integrations/tally/connector/route.ts")assert.match(source,/await authenticateBridge\(request\)/);else assert.match(source,/company-auth/,path);assert.doesNotMatch(source,/getChatGPTUser\(\)/,path);}}}
 scan("app/api");
});

test("database guards reject concurrent customer and supplier overpayments",()=>{
 const s=setup(),owner="company";
 s.db.prepare("INSERT INTO invoices(id,owner_user_id,invoice_number,invoice_date,customer_name,subtotal_paise,total_paise,paid_paise,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run("i",owner,"INV-1","2026-01-01","Customer",10000,10000,9000,"part_paid",1);
 assert.throws(()=>s.db.prepare("UPDATE invoices SET paid_paise=paid_paise+2000 WHERE id='i'").run(),/INVOICE_PAYMENT_OUT_OF_RANGE/);
 s.db.prepare("INSERT INTO purchases(id,owner_user_id,purchase_number,supplier_name,purchase_date,subtotal_paise,gst_paise,total_paise,paid_paise,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("p",owner,"PUR-1","Supplier","2026-01-01",10000,0,10000,9000,"part_paid",1);
 assert.throws(()=>s.db.prepare("UPDATE purchases SET paid_paise=paid_paise+2000 WHERE id='p'").run(),/PURCHASE_PAYMENT_OUT_OF_RANGE/);
});
