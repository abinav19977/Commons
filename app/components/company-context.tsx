"use client";
import { usePathname } from "next/navigation";
export default function CompanyContext({name}:{name:string}){
  const path=usePathname();
  if(path==="/" || path.startsWith("/companies")) return null;
  return <aside style={{display:"flex",gap:20,justifyContent:"space-between",alignItems:"center",padding:"12px 24px",borderBottom:"1px solid #222",background:"#000",color:"#fff",fontSize:14}} aria-label="Selected company"><span>Company · <strong>{name}</strong></span><a href="/companies" style={{color:"white",whiteSpace:"nowrap"}}>Switch company</a></aside>;
}
