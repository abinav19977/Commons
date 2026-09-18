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
  const purchase = await raw.prepare("SELECT id,purchase_number,supplier_id,supplier_name,total_paise,tds_paise,paid_paise,status FROM purchases WHERE id=? AND owner_user_id=?")
    .bind(parsed.data.purchaseId, user.id).first<{id:string;purchase_number:string;supplier_id:string|null;supplier_name:string;total_paise:number;tds_paise:number;paid_paise:number;status:string}>();
  if (!purchase || purchase.status === "ordered") return NextResponse.json({ message: "Select a received supplier bill." }, { status: 404 });
  // What's actually still owed in cash is net of any TDS already withheld — the supplier
  // was never due the gross total once tax was deducted at source.
  const netPayable = purchase.total_paise - purchase.tds_paise;
  const outstanding = netPayable - purchase.paid_paise;
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
    await raw.batch([
      raw.prepare("UPDATE purchases SET paid_paise=paid_paise+?,status=CASE WHEN paid_paise+?>=(total_paise-tds_paise) THEN 'paid' ELSE 'part_paid' END WHERE id=? AND owner_user_id=?").bind(amountPaise,amountPaise,purchase.id,user.id),
      raw.prepare("INSERT INTO purchase_payments (id,owner_user_id,purchase_id,purchase_number,supplier_name,payment_date,amount_paise,payment_mode,reference,journal_entry_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id,user.id,purchase.id,purchase.purchase_number,purchase.supplier_name,parsed.data.paymentDate,amountPaise,parsed.data.paymentMode,parsed.data.reference||null,journal.id,Date.now()),
      ...journal.statements,
    ]);
    return NextResponse.json({ message: `Supplier payment saved as ${journal.number}.`, outstandingPaise: outstanding - amountPaise }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    if (error instanceof Error && error.message.includes("PURCHASE_PAYMENT_OUT_OF_RANGE")) return NextResponse.json({ message: "Another payment changed this supplier bill. Refresh and enter no more than the latest balance." }, { status: 409 });
    console.error("Supplier payment failed", error);
    return NextResponse.json({ message: "The supplier payment could not be saved." }, { status: 500 });
  }
}
