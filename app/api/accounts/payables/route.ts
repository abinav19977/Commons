import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { rupeesToPaise, supplierPaymentEntry } from "../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../lib/book-server";

const schema = z.object({
  purchaseId: z.string().trim().min(1).max(100),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string(),
  paymentMode: z.enum(["bank_transfer", "upi", "cash", "cheque", "other"]),
  reference: z.string().trim().max(100).optional().default(""),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again or ask the owner for payment access." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the supplier payment details." }, { status: 400 });
  const amountPaise = rupeesToPaise(parsed.data.amount);
  if (!amountPaise) return NextResponse.json({ message: "Enter an amount greater than zero." }, { status: 400 });
  const raw = getRawDb();
  const purchase = await raw.prepare("SELECT id,purchase_number,supplier_id,supplier_name,total_paise,paid_paise,status FROM purchases WHERE id=? AND owner_user_id=?")
    .bind(parsed.data.purchaseId, user.id).first<{id:string;purchase_number:string;supplier_id:string|null;supplier_name:string;total_paise:number;paid_paise:number;status:string}>();
  if (!purchase || purchase.status === "ordered") return NextResponse.json({ message: "Select a received supplier bill." }, { status: 404 });
  const outstanding = purchase.total_paise - purchase.paid_paise;
  if (amountPaise > outstanding) return NextResponse.json({ message: "Payment cannot exceed the supplier bill balance." }, { status: 400 });
  try {
    await assertPeriodOpen(user.id, parsed.data.paymentDate);
    const id = crypto.randomUUID();
    const journal = await prepareJournal({
      ownerUserId: user.id,
      actor: user.email,
      entryDate: parsed.data.paymentDate,
      sourceType: "supplier_payment",
      sourceId: id,
      description: `Payment for ${purchase.purchase_number} · ${purchase.supplier_name}`,
      lines: supplierPaymentEntry(amountPaise, parsed.data.paymentMode === "cash").map((line) => line.accountCode === "2000" ? { ...line, partyType: "supplier" as const, partyId: purchase.supplier_id, partyName: purchase.supplier_name } : line),
    });
    const newPaid = purchase.paid_paise + amountPaise;
    await raw.batch([
      raw.prepare("UPDATE purchases SET paid_paise=?,status=? WHERE id=? AND owner_user_id=?").bind(newPaid, newPaid === purchase.total_paise ? "paid" : "part_paid", purchase.id, user.id),
      raw.prepare("INSERT INTO purchase_payments (id,owner_user_id,purchase_id,purchase_number,supplier_name,payment_date,amount_paise,payment_mode,reference,journal_entry_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,user.id,purchase.id,purchase.purchase_number,purchase.supplier_name,parsed.data.paymentDate,amountPaise,parsed.data.paymentMode,parsed.data.reference||null,journal.id,Date.now()),
      ...journal.statements,
    ]);
    return NextResponse.json({ message: `Supplier payment saved as ${journal.number}.`, outstandingPaise: outstanding - amountPaise }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    console.error("Supplier payment failed", error);
    return NextResponse.json({ message: "The supplier payment could not be saved." }, { status: 500 });
  }
}
