import { NextResponse } from "next/server";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { BACKUP_FORMAT,BACKUP_TABLES } from "../../../lib/backup";
import { digest } from "../../../lib/tally-bridge";

type Backup={format:string;companyId:string;dataSha256:string;data:Record<string,Record<string,unknown>[]>};
export async function POST(request:Request){
 const user=await getChatGPTUser(request);if(!user)return NextResponse.json({message:"Please sign in again."},{status:401});
 if(user.role!=="owner")return NextResponse.json({message:"Only the company owner can restore a backup."},{status:403});
 const body=await request.json().catch(()=>null) as {backup?:Backup;confirmation?:string}|null;const backup=body?.backup;
 if(!backup||backup.format!==BACKUP_FORMAT||backup.companyId!==user.id)return NextResponse.json({message:"This is not a compatible backup for the selected company."},{status:400});
 if(await digest(JSON.stringify(backup.data))!==backup.dataSha256)return NextResponse.json({message:"Backup integrity check failed. The file may be incomplete or changed."},{status:400});
 const keys=Object.keys(backup.data);if(keys.some(key=>!BACKUP_TABLES.includes(key as typeof BACKUP_TABLES[number])))return NextResponse.json({message:"Backup contains an unsupported table."},{status:400});
 const rowCount=keys.reduce((sum,key)=>sum+(Array.isArray(backup.data[key])?backup.data[key].length:0),0);if(rowCount>25000)return NextResponse.json({message:"This backup has more than 25,000 rows. Contact support for a supervised restore."},{status:413});
 if(body?.confirmation!=="RESTORE EMPTY COMPANY")return NextResponse.json({verified:true,rowCount,message:"Backup verified. Type RESTORE EMPTY COMPANY to restore it."});
 const raw=getRawDb();const existing=await raw.prepare("SELECT (SELECT COUNT(*) FROM journal_entries WHERE owner_user_id=?)+(SELECT COUNT(*) FROM invoices WHERE owner_user_id=?)+(SELECT COUNT(*) FROM purchases WHERE owner_user_id=?)+(SELECT COUNT(*) FROM products WHERE owner_user_id=?)+(SELECT COUNT(*) FROM customers WHERE owner_user_id=?) AS total").bind(user.id,user.id,user.id,user.id,user.id).first<{total:number}>();
 if(Number(existing?.total||0)>0)return NextResponse.json({message:"Restore is allowed only into an empty company. This prevents an accidental overwrite."},{status:409});
 try{
  const statements=[] as ReturnType<typeof raw.prepare>[];
  for(const table of BACKUP_TABLES){if(table==="business_profiles")continue;for(const row of backup.data[table]||[]){const columns=Object.keys(row);if(!columns.length||columns.some(column=>!/^[a-z][a-z0-9_]*$/.test(column)))throw Error("INVALID_COLUMNS");const values=columns.map(column=>column==="owner_user_id"?user.id:row[column]);statements.push(raw.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(()=>"?").join(",")})`).bind(...values));}}
  for(let i=0;i<statements.length;i+=100)await raw.batch(statements.slice(i,i+100));return NextResponse.json({restored:true,rowCount,message:"Backup restored in checked batches. Review the trial balance and record counts before using the company."});
 }catch(error){console.error("Backup restore failed",error);try{for(const table of [...BACKUP_TABLES].reverse()){if(table!=="business_profiles")await raw.prepare(`DELETE FROM ${table} WHERE owner_user_id=?`).bind(user.id).run();}}catch(cleanupError){console.error("Backup cleanup failed",cleanupError)}return NextResponse.json({message:"Restore failed and inserted rows were removed. Check that the backup matches this release, then retry."},{status:500});}
}
