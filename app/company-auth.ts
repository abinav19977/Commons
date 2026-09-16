import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRawDb } from "../db";
import { getChatGPTUser as getAccount, requireChatGPTUser as requireAccount } from "./chatgpt-auth";
export { chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
export const COMPANY_COOKIE = "commons-company";

// Legacy owner_user_id columns hold an immutable company namespace, NOT account identity.
// The first company retains the original account namespace to preserve existing records.
export async function claimLegacyCompany(accountId: string) {
  await getRawDb().prepare(`INSERT INTO companies (id,account_user_id,slot,created_at)
    SELECT owner_user_id,owner_user_id,1,? FROM business_profiles WHERE owner_user_id=?
    ON CONFLICT DO NOTHING`).bind(Date.now(), accountId).run();
}
export async function listCompanies(accountId: string, email?: string) {
  await claimLegacyCompany(accountId);
  return (await getRawDb().prepare(`SELECT c.id,c.slot,p.legal_name,p.trade_name,p.city,p.gstin
    FROM companies c JOIN business_profiles p ON p.owner_user_id=c.id
    WHERE c.account_user_id=? OR (? IS NOT NULL AND EXISTS (SELECT 1 FROM business_members m WHERE m.owner_user_id=c.id AND lower(m.email)=lower(?) AND m.status='active')) ORDER BY c.slot`).bind(accountId,email||null,email||null).all<{
      id:string;slot:number;legal_name:string;trade_name:string|null;city:string|null;gstin:string|null
    }>()).results;
}
export async function getChatGPTUser(request?: Request) {
  const account = await getAccount();
  if (!account) return null;
  const selected = (await cookies()).get(COMPANY_COOKIE)?.value;
  if (!selected) return null;
  if (request && !["GET","HEAD"].includes(request.method) && request.headers.get("x-commons-company") !== selected) return null;
  const pinned = request?.headers.get("x-commons-company");
  if (pinned && pinned !== selected) return null;
  const company = await getRawDb().prepare(`SELECT c.id,p.legal_name,CASE WHEN c.account_user_id=? THEN 'owner' ELSE m.role END AS role FROM companies c
    JOIN business_profiles p ON p.owner_user_id=c.id LEFT JOIN business_members m ON m.owner_user_id=c.id AND lower(m.email)=lower(?) AND m.status='active'
    WHERE c.id=? AND (c.account_user_id=? OR m.id IS NOT NULL)`)
    .bind(account.id,account.email,selected,account.id).first<{id:string;legal_name:string;role:"viewer"|"operator"|"accountant"|"owner"}>();
  if(company && request && !["GET","HEAD"].includes(request.method) && company.role==="viewer") return null;
  if (company && request && !["GET","HEAD"].includes(request.method) && request.headers.get("content-type")?.includes("application/json")) {
    const body = await request.clone().json().catch(()=>null);
    const references = new Map<string, {table:string;id:string}>();
    const tables:Record<string,string>={customerId:"customers",supplierId:"suppliers",productId:"products",invoiceId:"invoices",employeeKey:"employees"};
    function collect(value:unknown,depth=0){
      if(depth>12 || !value || typeof value!=="object") return;
      for(const [key,item] of Object.entries(value)){
        let table=tables[key];
        if(key==="partyId") table=body?.advanceType==="customer_received"?"customers":body?.advanceType==="supplier_paid"?"suppliers":"employees";
        if(table && typeof item==="string" && item) references.set(table+":"+item,{table,id:item});
        else if(typeof item==="object") collect(item,depth+1);
      }
    }
    collect(body);
    if(references.size>150) return null;
    for(const {table,id} of references.values()) {
      const owned=await getRawDb().prepare(`SELECT id FROM ${table} WHERE id=? AND owner_user_id=?`).bind(id,company.id).first();
      if(!owned) return null;
    }
  }
  return company ? {...account, accountId:account.id, id:company.id, companyName:company.legal_name, role:company.role} : null;
}
export async function requireChatGPTUser(returnTo: string) {
  await requireAccount(returnTo);
  const company = await getChatGPTUser();
  if (!company) redirect("/companies");
  return company;
}
