import { FolderTree } from "lucide-react";
import { requireChatGPTUser } from "../company-auth";
export const dynamic="force-dynamic";
export const metadata={title:"Other tools · Commons"};
export default async function ToolsPage(){
 await requireChatGPTUser("/tools");
 return <main className="workspace-shell"><section className="workspace"><a className="back-link" href="/workspace">← Workspace</a><div className="universe-heading"><h1>Other tools</h1></div><nav className="tool-grid" aria-label="Other tools"><a className="tool-tile" href="/tools/files"><span className="tool-number">01</span><FolderTree aria-hidden="true" strokeWidth={1.45}/><span className="tool-label">File organiser</span></a></nav></section></main>;
}
