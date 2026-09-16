import { cookies } from "next/headers";
import { requireChatGPTUser } from "../chatgpt-auth";
import { listCompanies, COMPANY_COOKIE } from "../company-auth";
import CompanyPicker from "./company-picker";
export const dynamic="force-dynamic";
export default async function CompaniesPage(){
 const user=await requireChatGPTUser("/companies");
 const companies=await listCompanies(user.id,user.email);
 return <main className="form-shell"><section className="customer-form-wrap"><a className="back-link" href="/">← Company options</a><div className="surface-heading"><h1>Your companies</h1><p>{companies.length} of 5 profiles · Separate records for every company</p></div><CompanyPicker companies={companies} active={(await cookies()).get(COMPANY_COOKIE)?.value}/>{!companies.length&&<p>Create a company to start recording your business.</p>}{companies.length<5&&<a className="primary-action" href="/companies/new">New Company Profile</a>}</section></main>;
}
