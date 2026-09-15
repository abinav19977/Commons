import { Building2, FolderOpen, Settings2 } from "lucide-react";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
 const user = await getChatGPTUser();
 const options = [{label:"New Company Profile",icon:Building2,href:"/companies/new"},{label:"Existing Company Profiles",icon:FolderOpen,href:"/companies"},{label:"Settings",icon:Settings2,href:"/settings"}];
 return <main className="workspace-shell"><header className="site-header workspace-header"><a className="wordmark" href="/">commons</a>{user && <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>}</header><section className="company-entry"><nav className="company-entry-grid" aria-label="Company options">{options.map(({label,icon:Icon,href},i)=><a className="tool-tile" key={href} href={user?href:chatGPTSignInPath(href)} target="_top"><span className="tool-number">0{i+1}</span><Icon aria-hidden="true" strokeWidth={1.35}/><span className="tool-label">{label}</span></a>)}</nav></section></main>;
}
