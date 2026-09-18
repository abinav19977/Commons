import { NextResponse } from "next/server";
import { tallyDate } from "../../../lib/tally-document";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { buildBackup } from "../../../lib/backup";
import { todayIST } from "../../../lib/date";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lock"), periodStart: z.string().length(10), periodEnd: z.string().length(10), reason: z.string().trim().min(3).max(240) }),
  z.object({ action: z.literal("backup"), note: z.string().trim().max(240).optional().default("") }),
  z.object({ action: z.literal("member"), email: z.string().email().max(200), role: z.enum(["viewer", "operator", "accountant", "owner"]) }),
  z.object({ action: z.literal("review"), periodStart: z.string().length(10), periodEnd: z.string().length(10) }),
]);

export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  if (!["owner", "accountant"].includes(user.role))
    return NextResponse.json({ message: "Owner or accountant access is required for this control." }, { status: 403 });
  try {
    const backup = await buildBackup(user.id);
    return new NextResponse(JSON.stringify({ ...backup, createdAt: new Date().toISOString(), companyId:user.id, restoreSupported:true, excluded:["account identity","connector credentials","external API credentials"] }, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="commons-backup-${todayIST()}.json"`, "cache-control": "no-store" } });
  } catch (error) {
    console.error("Backup export failed", error);
    return NextResponse.json({ message: "Backup could not be prepared." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the control details." }, { status: 400 });
  const d = parsed.data;
  if (d.action === "member" && user.role !== "owner") return NextResponse.json({ message: "Only the company owner can change team access." }, { status: 403 });
  if (d.action !== "member" && !["owner","accountant"].includes(user.role)) return NextResponse.json({ message: "Owner or accountant access is required for this control." }, { status: 403 });
  if((d.action==="lock"||d.action==="review")&&(!tallyDate(d.periodStart.replaceAll("-",""))||!tallyDate(d.periodEnd.replaceAll("-",""))))return NextResponse.json({message:"Choose valid calendar dates."},{status:400});
  const raw = getRawDb();
  const now = Date.now();
  try {
    if (d.action === "lock") {
      if (d.periodEnd < d.periodStart) return NextResponse.json({ message: "End date must be after start date." }, { status: 400 });
      const openReview = await raw.prepare("SELECT COUNT(*) AS count FROM journal_entries WHERE owner_user_id = ? AND entry_date BETWEEN ? AND ? AND reviewed_at IS NULL").bind(user.id,d.periodStart,d.periodEnd).first<{count:number}>();
      if ((openReview?.count||0)>0) return NextResponse.json({ message: `${openReview?.count} accounting entries still need review before this period can be locked.` }, { status: 409 });
      const id = crypto.randomUUID();
      await raw.prepare("INSERT INTO period_locks (id,owner_user_id,period_start,period_end,reason,locked_by,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(id, user.id, d.periodStart, d.periodEnd, d.reason, user.email, now).run();
      return NextResponse.json({ id }, { status: 201 });
    }
    if (d.action === "member") {
      const id = crypto.randomUUID();
      if(d.email.toLowerCase()===user.email.toLowerCase()) return NextResponse.json({message:"The owner already has full access."},{status:400});
      await raw.prepare("INSERT INTO business_members (id,owner_user_id,email,role,status,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_user_id,email) DO UPDATE SET role=excluded.role, status='active'")
        .bind(id, user.id, d.email.toLowerCase(), d.role, "active", now).run();
      return NextResponse.json({ id }, { status: 201 });
    }
    if (d.action === "review") {
      if (d.periodEnd < d.periodStart) return NextResponse.json({ message: "End date must be after start date." }, { status: 400 });
      const result=await raw.prepare("UPDATE journal_entries SET reviewed_by = ?, reviewed_at = ? WHERE owner_user_id = ? AND entry_date BETWEEN ? AND ? AND reviewed_at IS NULL").bind(user.email,now,user.id,d.periodStart,d.periodEnd).run();
      return NextResponse.json({ reviewed: result.meta.changes });
    }
    const counts = await raw.prepare("SELECT (SELECT COUNT(*) FROM journal_entries WHERE owner_user_id = ?) + (SELECT COUNT(*) FROM invoices WHERE owner_user_id = ?) + (SELECT COUNT(*) FROM purchases WHERE owner_user_id = ?) AS total")
      .bind(user.id, user.id, user.id).first<{ total: number }>();
    const id = crypto.randomUUID();
    await raw.prepare("INSERT INTO backup_snapshots (id,owner_user_id,requested_by,record_count,status,note,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id, user.id, user.email, counts?.total || 0, "requested", d.note || null, now).run();
    return NextResponse.json({ id, recordCount: counts?.total || 0 }, { status: 201 });
  } catch (error) {
    console.error("Control save failed", error);
    return NextResponse.json({ message: "The control could not be saved." }, { status: 500 });
  }
}
