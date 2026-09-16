import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { COMPANY_COOKIE, claimLegacyCompany } from "../../../company-auth";
import { getRawDb } from "../../../../db";
export async function POST(request:Request) {
  const account=await getChatGPTUser();
  if(!account) return NextResponse.json({message:"Please sign in again."},{status:401});
  if(request.headers.get("origin")!==new URL(request.url).origin) return NextResponse.json({message:"Please open this form in Commons."},{status:403});
  const body=await request.json().catch(()=>null);
  if(typeof body?.id!=="string") return NextResponse.json({message:"Choose a company."},{status:400});
  await claimLegacyCompany(account.id);
  const found=await getRawDb().prepare("SELECT c.id FROM companies c LEFT JOIN business_members m ON m.owner_user_id=c.id AND lower(m.email)=lower(?) AND m.status='active' WHERE c.id=? AND (c.account_user_id=? OR m.id IS NOT NULL)").bind(account.email,body.id,account.id).first();
  if(!found) return NextResponse.json({message:"Company not available."},{status:404});
  const response=NextResponse.json({ok:true});
  response.cookies.set(COMPANY_COOKIE,body.id,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:31536000});
  return response;
}
