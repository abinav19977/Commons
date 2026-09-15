import { requireChatGPTUser } from "../../chatgpt-auth";
import { listCompanies } from "../../company-auth";
import BusinessForm from "../../other/business/business-form";
export const dynamic="force-dynamic";
export default async function NewCompanyPage(){
 const user=await requireChatGPTUser("/companies/new");const companies=await listCompanies(user.id);
 return <main className="form-shell"><section className="customer-form-wrap"><a className="back-link" href="/companies">← Your companies</a><div className="surface-heading"><h1>New Company Profile</h1><p>{companies.length} of 5 profiles used. Each company has its own business records and accounts.</p></div>{companies.length>=5?<p>You have reached five companies. <a href="/companies">Open an existing company</a>.</p>:<BusinessForm profile={null} createOnly/>}</section></main>;
}
