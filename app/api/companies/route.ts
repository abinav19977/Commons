import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../db";
import { getChatGPTUser } from "../../chatgpt-auth";
import { COMPANY_COOKIE, listCompanies } from "../../company-auth";
const o = (n: number) => z.string().trim().max(n).optional().default("");
const schema = z
  .object({
    createOnly: z.boolean().optional().default(false),
    legalName: z.string().trim().min(1).max(160),
    tradeName: o(160),
    phone: o(20),
    email: z
      .union([z.string().trim().email(), z.literal("")])
      .optional()
      .default(""),
    gstin: o(15),
    pan: o(10),
    invoicePrefix: z.string().trim().min(1).max(12),
    addressLine1: o(180),
    addressLine2: o(180),
    city: o(80),
    state: o(80),
    pinCode: o(6),
    bankName: o(120),
    accountName: o(120),
    accountNumber: o(40),
    ifsc: o(11),
    terms: o(600),
  })
  .superRefine((v, c) => {
    if (
      v.gstin &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
        v.gstin.toUpperCase(),
      )
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstin"],
        message: "Enter a valid GSTIN.",
      });
    if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.pan.toUpperCase()))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pan"],
        message: "Enter a valid PAN.",
      });
    if (v.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc.toUpperCase()))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ifsc"],
        message: "Enter a valid IFSC.",
      });
  });
const b = (v: string) => v || null;

export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!user) return NextResponse.json({message:"Please sign in again."},{status:401});
 if(request.headers.get("origin")!==new URL(request.url).origin) return NextResponse.json({message:"Please open this form in Commons."},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success) return NextResponse.json({message:parsed.error.issues[0]?.message||"Check the company details."},{status:400});
 const existing=await listCompanies(user.id);
 if(existing.length>=5) return NextResponse.json({message:"You can have up to five companies per account."},{status:409});
 const companyId=existing.length===0?user.id:"company-"+crypto.randomUUID();
  const d = parsed.data;
  const now = new Date();
  const values = {
    ownerUserId: companyId,
    legalName: d.legalName,
    tradeName: b(d.tradeName),
    gstin: b(d.gstin.toUpperCase()),
    pan: b(d.pan.toUpperCase()),
    phone: b(d.phone),
    email: b(d.email),
    addressLine1: b(d.addressLine1),
    addressLine2: b(d.addressLine2),
    city: b(d.city),
    state: b(d.state),
    pinCode: b(d.pinCode),
    bankName: b(d.bankName),
    accountName: b(d.accountName),
    accountNumber: b(d.accountNumber),
    ifsc: b(d.ifsc.toUpperCase()),
    invoicePrefix: d.invoicePrefix.toUpperCase(),
    terms: b(d.terms),
    updatedAt: now,
  };

 const columns=Object.keys(values).map(key=>key.replace(/[A-Z]/g,letter=>"_"+letter.toLowerCase()).replace(/([a-z])(\d)/g,"$1_$2"));
 const parameters=Object.values(values).map(value=>value instanceof Date?value.getTime():value);
 const raw=getRawDb();
 try {
 const results=await raw.batch([
 raw.prepare(`INSERT INTO companies (id,account_user_id,slot,created_at)
 SELECT ?,?,s.slot,? FROM (SELECT 1 AS slot UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) s
 WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.account_user_id=? AND c.slot=s.slot) ORDER BY s.slot LIMIT 1`).bind(companyId,user.id,Date.now(),user.id),
 raw.prepare(`INSERT INTO business_profiles (${columns.join(",")}) SELECT ${columns.map(()=>"?").join(",")} WHERE EXISTS (SELECT 1 FROM companies WHERE id=? AND account_user_id=?)`).bind(...parameters,companyId,user.id)
 ]);
 if(!results[0].meta.changes) return NextResponse.json({message:"Five companies already exist. Open your company list."},{status:409});
 const response=NextResponse.json({message:"Company created."},{status:201});
 response.cookies.set(COMPANY_COOKIE,companyId,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:31536000});
 return response;
 } catch(error){console.error("Company creation failed",error);return NextResponse.json({message:"Company could not be created. Refresh your company list and try again."},{status:409});}
}
