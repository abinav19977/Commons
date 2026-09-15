import { NextResponse } from "next/server";
import { digest } from "../../../lib/tally-bridge";
import { tallyDate } from "../../../lib/tally-document";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lock"), periodStart: z.string().length(10), periodEnd: z.string().length(10), reason: z.string().trim().min(3).max(240) }),
  z.object({ action: z.literal("backup"), note: z.string().trim().max(240).optional().default("") }),
  z.object({ action: z.literal("member"), email: z.string().email().max(200), role: z.enum(["viewer", "operator", "accountant", "owner"]) }),
  z.object({ action: z.literal("review"), periodStart: z.string().length(10), periodEnd: z.string().length(10) }),
]);

export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const raw = getRawDb();
  const tableNames = ["business_profiles", "customers", "suppliers", "products", "invoices", "invoice_items", "invoice_payments", "purchases", "purchase_items", "stock_movements", "employees", "ledger_accounts", "gst_filing_sessions", "receivable_settings", "reminder_logs", "business_members", "tally_documents", "tally_bill_allocations", "tally_batch_effects", "tally_import_receipts", "tally_transfers", "payment_advances", "payroll_entries", "bank_import_batches", "bank_transactions", "journal_entries", "journal_lines", "adjustment_documents", "warehouses", "inventory_batches", "period_locks", "audit_events"];
  try {
    const results = await raw.batch(tableNames.map((table) => raw.prepare(`SELECT * FROM ${table} WHERE owner_user_id = ?`).bind(user.id)));
    const data = Object.fromEntries(tableNames.map((table, index) => [table, results[index].results]));
    return new NextResponse(JSON.stringify({ format: "commons-backup-v2", createdAt: new Date().toISOString(), companyId:user.id, restoreVerified:false, excluded:["account identity","connector credentials","external API credentials"], dataSha256:await digest(JSON.stringify(data)), data }, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="commons-backup-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
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
      await raw.prepare("INSERT INTO business_members (id,owner_user_id,email,role,status,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_user_id,email) DO UPDATE SET role=excluded.role, status='invited'")
        .bind(id, user.id, d.email.toLowerCase(), d.role, "invited", now).run();
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
