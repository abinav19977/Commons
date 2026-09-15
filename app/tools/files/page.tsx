import { requireChatGPTUser } from "../../company-auth";
import FileOrganiser from "./file-organiser";
export const dynamic="force-dynamic";
export const metadata={title:"File organiser · Commons"};
export default async function FilesPage(){await requireChatGPTUser("/tools/files");return <main className="form-shell"><section className="customer-form-wrap file-organiser"><a className="back-link" href="/tools">← Other tools</a><FileOrganiser/></section></main>;}
