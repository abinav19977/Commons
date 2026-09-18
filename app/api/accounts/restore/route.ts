import { NextResponse } from "next/server";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { BACKUP_FORMAT, BACKUP_TABLES, applyBackup, buildBackup, clearBackupTables } from "../../../lib/backup";
import { digest } from "../../../lib/tally-bridge";

type Backup = { format: string; companyId: string; dataSha256: string; data: Record<string, Record<string, unknown>[]> };
type Body = { backup?: Backup; snapshotId?: string; confirmation?: string } | null;

const EMPTY_PHRASE = "RESTORE EMPTY COMPANY";
const OVERWRITE_PHRASE = "REPLACE ALL COMPANY DATA";

async function existingRowCount(ownerUserId: string) {
  const raw = getRawDb();
  const row = await raw.prepare(
    "SELECT (SELECT COUNT(*) FROM journal_entries WHERE owner_user_id=?)+(SELECT COUNT(*) FROM invoices WHERE owner_user_id=?)+(SELECT COUNT(*) FROM purchases WHERE owner_user_id=?)+(SELECT COUNT(*) FROM products WHERE owner_user_id=?)+(SELECT COUNT(*) FROM customers WHERE owner_user_id=?) AS total",
  ).bind(ownerUserId, ownerUserId, ownerUserId, ownerUserId, ownerUserId).first<{ total: number }>();
  return Number(row?.total || 0);
}

function validateBackupShape(data: Record<string, Record<string, unknown>[]>) {
  const keys = Object.keys(data);
  if (keys.some((key) => !BACKUP_TABLES.includes(key as (typeof BACKUP_TABLES)[number]))) throw new Error("UNSUPPORTED_TABLE");
  const rowCount = keys.reduce((sum, key) => sum + (Array.isArray(data[key]) ? data[key].length : 0), 0);
  if (rowCount > 25000) throw new Error("TOO_MANY_ROWS");
  return rowCount;
}

// List recent safety snapshots for the owner (metadata only — never the data payload).
export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ message: "Only the company owner can view safety snapshots." }, { status: 403 });
  const rows = await getRawDb().prepare(
    "SELECT id,requested_by,record_count,note,created_at FROM backup_snapshots WHERE owner_user_id=? AND data IS NOT NULL ORDER BY created_at DESC LIMIT 20",
  ).bind(user.id).all<{ id: string; requested_by: string; record_count: number; note: string | null; created_at: number }>();
  return NextResponse.json({ snapshots: rows.results });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ message: "Only the company owner can restore a backup." }, { status: 403 });
  const body = await request.json().catch(() => null) as Body;
  const raw = getRawDb();

  // Restoring a previously auto-saved safety snapshot (the "undo" path).
  if (body?.snapshotId) {
    const snapshot = await raw.prepare("SELECT data,checksum,record_count FROM backup_snapshots WHERE id=? AND owner_user_id=?").bind(body.snapshotId, user.id).first<{ data: string | null; checksum: string | null; record_count: number }>();
    if (!snapshot?.data) return NextResponse.json({ message: "Snapshot not found." }, { status: 404 });
    if (await digest(snapshot.data) !== snapshot.checksum) return NextResponse.json({ message: "Snapshot integrity check failed." }, { status: 400 });
    if (body.confirmation !== OVERWRITE_PHRASE) return NextResponse.json({ verified: true, rowCount: snapshot.record_count, message: `Snapshot verified. Type ${OVERWRITE_PHRASE} to restore it, replacing everything currently in this company.` });
    try {
      const data = JSON.parse(snapshot.data) as Record<string, Record<string, unknown>[]>;
      await clearBackupTables(user.id);
      const rowCount = await applyBackup(user.id, data);
      return NextResponse.json({ restored: true, rowCount, message: "Snapshot restored. Review the trial balance and record counts before using the company." });
    } catch (error) {
      console.error("Snapshot restore failed", error);
      return NextResponse.json({ message: "Snapshot could not be restored. Company data was left as-is." }, { status: 500 });
    }
  }

  const backup = body?.backup;
  if (!backup || backup.format !== BACKUP_FORMAT || backup.companyId !== user.id) return NextResponse.json({ message: "This is not a compatible backup for the selected company." }, { status: 400 });
  if (await digest(JSON.stringify(backup.data)) !== backup.dataSha256) return NextResponse.json({ message: "Backup integrity check failed. The file may be incomplete or changed." }, { status: 400 });
  let rowCount: number;
  try {
    rowCount = validateBackupShape(backup.data);
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_MANY_ROWS") return NextResponse.json({ message: "This backup has more than 25,000 rows. Contact support for a supervised restore." }, { status: 413 });
    return NextResponse.json({ message: "Backup contains an unsupported table." }, { status: 400 });
  }

  const existing = await existingRowCount(user.id);

  // Common case: restoring into a fresh, empty company. Unchanged from before.
  if (existing === 0) {
    if (body?.confirmation !== EMPTY_PHRASE) return NextResponse.json({ verified: true, rowCount, message: `Backup verified. Type ${EMPTY_PHRASE} to restore it.` });
    try {
      await applyBackup(user.id, backup.data);
      return NextResponse.json({ restored: true, rowCount, message: "Backup restored in checked batches. Review the trial balance and record counts before using the company." });
    } catch (error) {
      console.error("Backup restore failed", error);
      try { await clearBackupTables(user.id); } catch (cleanupError) { console.error("Backup cleanup failed", cleanupError); }
      return NextResponse.json({ message: "Restore failed and inserted rows were removed. Check that the backup matches this release, then retry." }, { status: 500 });
    }
  }

  // The company already has data. Only proceed with the stronger phrase, and take a
  // fresh safety snapshot of everything currently here — restorable via GET/snapshotId
  // above — immediately before replacing it.
  if (body?.confirmation !== OVERWRITE_PHRASE) {
    return NextResponse.json({
      verified: true,
      rowCount,
      requiresOverwrite: true,
      message: `This company already has data. Type ${OVERWRITE_PHRASE} to replace it with this backup. A safety snapshot of the current data will be saved automatically first, and can be restored if this was a mistake.`,
    });
  }
  try {
    const snapshot = await buildBackup(user.id);
    const snapshotId = crypto.randomUUID();
    await raw.prepare(
      "INSERT INTO backup_snapshots (id,owner_user_id,requested_by,record_count,status,note,data,checksum,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(snapshotId, user.id, user.email, existing, "pre_restore", "Automatic snapshot before overwrite restore", JSON.stringify(snapshot.data), snapshot.dataSha256, Date.now()).run();
    await clearBackupTables(user.id);
    await applyBackup(user.id, backup.data);
    return NextResponse.json({ restored: true, rowCount, snapshotId, message: "Company data replaced. The previous data was saved as a safety snapshot in case this needs to be undone." });
  } catch (error) {
    console.error("Overwrite restore failed", error);
    return NextResponse.json({ message: "Restore failed. A safety snapshot of your prior data was saved before any changes — contact support with this timestamp if data looks wrong." }, { status: 500 });
  }
}
