import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../db";
import { getChatGPTUser } from "../../company-auth";
import { advanceApplicationEntry, advanceEntry } from "../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../lib/book-server";
import { todayIST } from "../../lib/date";

const schema = z.object({
  advanceType: z.enum(["customer_received", "supplier_paid", "employee_paid"]),
  partyId: z.string().max(100).optional().default(""),
  partyName: z.string().trim().min(1).max(160),
  advanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive().max(1000000000),
  appliedAmount: z.number().min(0).max(1000000000).default(0),
  paymentMode: z.enum(["bank_transfer", "upi", "cash", "cheque", "other"]),
  reference: z.string().trim().max(100).optional().default(""),
  purpose: z.string().trim().max(240).optional().default(""),
  notes: z.string().trim().max(500).optional().default(""),
});

const blank = (value: string) => value || null;

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check the advance details." },
      { status: 400 },
    );
  const data = parsed.data;
  const amountPaise = Math.round(data.amount * 100);
  const appliedPaise = Math.round(data.appliedAmount * 100);
  if (appliedPaise > amountPaise)
    return NextResponse.json(
      { message: "Applied amount cannot exceed the advance amount." },
      { status: 400 },
    );
  if (data.advanceType === "employee_paid" && appliedPaise > 0)
    return NextResponse.json(
      { message: "Recover an employee advance through payroll." },
      { status: 400 },
    );
  const now = Date.now();
  const status = appliedPaise === amountPaise ? "applied" : "active";
  try {
    const raw = getRawDb();
    await assertPeriodOpen(user.id, data.advanceDate);
    const id = crypto.randomUUID();
    const save = raw.prepare(
        "INSERT INTO payment_advances (id,owner_user_id,advance_type,party_id,party_name,advance_date,amount_paise,applied_paise,payment_mode,reference,purpose,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.id,
        data.advanceType,
        blank(data.partyId),
        data.partyName,
        data.advanceDate,
        amountPaise,
        appliedPaise,
        data.paymentMode,
        blank(data.reference),
        blank(data.purpose),
        blank(data.notes),
        status,
        now,
        now,
      );
    const journal = await prepareJournal({ ownerUserId: user.id, actor: user.email, entryDate: data.advanceDate, sourceType: "advance", sourceId: id, description: `${data.advanceType.replaceAll("_", " ")} · ${data.partyName}`, lines: advanceEntry(data.advanceType, amountPaise, data.paymentMode === "cash") });
    const application = appliedPaise > 0 && data.advanceType !== "employee_paid"
      ? await prepareJournal({ ownerUserId: user.id, actor: user.email, entryDate: data.advanceDate, sourceType: "advance_application", sourceId: `${id}:opening`, description: `Advance applied · ${data.partyName}`, lines: advanceApplicationEntry(data.advanceType, appliedPaise).map((line) => (line.accountCode === "1100" || line.accountCode === "2000") ? { ...line, partyType: data.advanceType === "customer_received" ? "customer" as const : "supplier" as const, partyId: blank(data.partyId), partyName: data.partyName } : line) })
      : null;
    await raw.batch([save, ...journal.statements, ...(application?.statements || [])]);
    return NextResponse.json({ message: "Advance recorded and posted to the books." }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    console.error("Advance save failed", error);
    return NextResponse.json({ message: "Advance could not be saved." }, { status: 500 });
  }
}

const applySchema = z.object({
  id: z.string().trim().min(1).max(100),
  amount: z.number().positive().max(1000000000),
});

export async function PATCH(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = applySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Enter a valid amount to apply." }, { status: 400 });
  const amountPaise = Math.round(parsed.data.amount * 100);
  try {
    const raw = getRawDb();
    const advance = await raw.prepare("SELECT id,advance_type,party_id,party_name,amount_paise,applied_paise FROM payment_advances WHERE id = ? AND owner_user_id = ?").bind(parsed.data.id, user.id).first<{ id:string; advance_type:"customer_received"|"supplier_paid"|"employee_paid"; party_id:string|null; party_name:string; amount_paise:number; applied_paise:number }>();
    if (!advance) return NextResponse.json({ message: "Advance not found." }, { status: 404 });
    if (advance.advance_type === "employee_paid") return NextResponse.json({ message: "Recover employee advances through payroll." }, { status: 400 });
    if (advance.applied_paise + amountPaise > advance.amount_paise) return NextResponse.json({ message: "The applied amount exceeds the available advance balance." }, { status: 400 });
    const applicationDate = todayIST();
    await assertPeriodOpen(user.id, applicationDate);
    const update = raw.prepare(
        "UPDATE payment_advances SET applied_paise = applied_paise + ?,status = CASE WHEN applied_paise + ? = amount_paise THEN 'applied' ELSE 'active' END,updated_at = ? WHERE id = ? AND owner_user_id = ? AND applied_paise + ? <= amount_paise",
      )
      .bind(
        amountPaise,
        amountPaise,
        Date.now(),
        parsed.data.id,
        user.id,
        amountPaise,
      );
    const journal = await prepareJournal({ ownerUserId: user.id, actor: user.email, entryDate: applicationDate, sourceType: "advance_application", sourceId: `${advance.id}:${advance.applied_paise + amountPaise}`, description: `Advance applied · ${advance.party_name}`, lines: advanceApplicationEntry(advance.advance_type, amountPaise).map((line) => (line.accountCode === "1100" || line.accountCode === "2000") ? { ...line, partyType: advance.advance_type === "customer_received" ? "customer" as const : "supplier" as const, partyId: advance.party_id, partyName: advance.party_name } : line) });
    await raw.batch([update, ...journal.statements]);
    return NextResponse.json({ message: "Advance applied and balances updated." });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    console.error("Advance application failed", error);
    return NextResponse.json({ message: "Advance balance could not be updated." }, { status: 500 });
  }
}
