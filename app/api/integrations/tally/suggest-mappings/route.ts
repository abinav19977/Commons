import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "../../../../company-auth";

const accountOptions = [
  ["1000","Cash in hand"],["1010","Bank account"],["1100","Customer money due"],["1200","Stock on hand"],["1300","Input GST credit"],
  ["1400","Supplier advances"],["1410","Employee advances"],["2000","Supplier money due"],["2100","GST payable"],["2200","Customer advances"],
  ["2210","Payroll deductions payable"],["3000","Owner's capital"],["3100","Opening balance equity"],["4000","Sales"],["4010","Other income"],
  ["4090","Sales returned"],["5000","Goods purchased"],["5090","Purchases returned"],["5100","Cost of goods sold"],["6000","Business expenses"],["6100","Salary expense"],
] as const;
const codes = new Set(accountOptions.map(([code])=>code));
const requestSchema=z.object({ledgers:z.array(z.object({name:z.string().trim().min(1).max(120),voucherTypes:z.array(z.string().trim().max(60)).max(12)})).min(1).max(60)});
const suggestionSchema=z.object({suggestions:z.array(z.object({name:z.string(),accountCode:z.string(),confidence:z.number().int().min(0).max(100),reason:z.string().trim().min(1).max(180)})).max(60)});

function responseText(data:unknown){const value=data as {output_text?:string;output?:Array<{content?:Array<{text?:string}>}>};return value.output_text?.trim()||value.output?.flatMap(item=>item.content||[]).map(item=>item.text||"").join("").trim()||"";}

export async function POST(request:Request){
  const user=await getChatGPTUser(request);if(!user)return NextResponse.json({message:"Please sign in and select the company again."},{status:401});
  const parsed=requestSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"Choose between 1 and 60 ledger names."},{status:400});
  const key=request.headers.get("x-commons-ai-key")?.trim();if(!key||key.length<20)return NextResponse.json({message:"Connect and verify an OpenAI API key in Settings first."},{status:428});
  const allowed=accountOptions.map(([code,label])=>`${code}: ${label}`).join("; ");
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(20_000),body:JSON.stringify({
      model:"gpt-5-mini",max_output_tokens:1800,
      input:[{role:"system",content:"You are a conservative Indian accounting and TallyPrime ledger-mapping assistant. Suggest only from the allowed Commons accounts. A ledger name alone may be ambiguous: use low confidence and an empty accountCode when unsure, especially for personal or party names. Never infer customer versus supplier without evidence. Keep each reason plain and under 20 words. These are suggestions for human review, not postings."},{role:"user",content:`Allowed accounts: ${allowed}. Ledgers and voucher usage: ${JSON.stringify(parsed.data.ledgers)}`}],
      text:{format:{type:"json_schema",name:"tally_ledger_mappings",strict:true,schema:{type:"object",additionalProperties:false,properties:{suggestions:{type:"array",items:{type:"object",additionalProperties:false,properties:{name:{type:"string"},accountCode:{type:"string"},confidence:{type:"integer",minimum:0,maximum:100},reason:{type:"string"}},required:["name","accountCode","confidence","reason"]}}},required:["suggestions"]}}}
    })});
    if(!response.ok)return NextResponse.json({message:"AI suggestions are unavailable. Check the API key and try again."},{status:502});
    const result=suggestionSchema.safeParse(JSON.parse(responseText(await response.json())));if(!result.success)return NextResponse.json({message:"AI returned suggestions in an unexpected format. Nothing was mapped."},{status:502});
    const requested=new Map(parsed.data.ledgers.map(item=>[item.name.toLowerCase(),item.name]));
    const suggestions=result.data.suggestions.filter(item=>requested.has(item.name.toLowerCase())).map(item=>({...item,name:requested.get(item.name.toLowerCase())!,accountCode:codes.has(item.accountCode as typeof accountOptions[number][0])?item.accountCode:"",confidence:codes.has(item.accountCode as typeof accountOptions[number][0])?item.confidence:0}));
    return NextResponse.json({suggestions});
  }catch{return NextResponse.json({message:"AI suggestions are temporarily unavailable. Nothing was mapped."},{status:502});}
}
