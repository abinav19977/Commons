import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { receiptEntry, rupeesToPaise } from "../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../lib/book-server";

const schema = z.object({
  invoiceId: z.string().trim().min(1).max(100),
  paymentDate: z.string().length(10),
  amount: z.string(),
  paymentMode: z.enum(["bank_transfer", "upi", "cash", "cheque", "other"]),
  reference: z.string().trim().max(100).optional().default(""),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the receipt details." }, { status: 400 });
  const amountPaise = rupeesToPaise(parsed.data.amount);
  if (!amountPaise) return NextResponse.json({ message: "Enter an amount greater than zero." }, { status: 400 });
  const raw = getRawDb();
  const invoice = await raw.prepare("SELECT id,invoice_number,customer_id,customer_name,total_paise,paid_paise FROM invoices WHERE id = ? AND owner_user_id = ?").bind(parsed.data.invoiceId, user.id).first<{id:string;invoice_number:string;customer_id:string|null;customer_name:string;total_paise:number;paid_paise:number}>();
  if (!invoice) return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
  const outstanding = invoice.total_paise - invoice.paid_paise;
  if (amountPaise > outstanding) return NextResponse.json({ message: "Receipt cannot exceed the invoice balance." }, { status: 400 });
  try {
    await assertPeriodOpen(user.id, parsed.data.paymentDate);
    const id = crypto.randomUUID();
    const journal = await prepareJournal({ ownerUserId: user.id, actor: user.email, entryDate: parsed.data.paymentDate, sourceType: "invoice_receipt", sourceId: id, description: `Receipt for ${invoice.invoice_number} · ${invoice.customer_name}`, lines: receiptEntry(amountPaise, parsed.data.paymentMode === "cash").map((line) => line.accountCode === "1100" ? { ...line, partyType: "customer" as const, partyId: invoice.customer_id, partyName: invoice.customer_name } : line) });
    await raw.batch([
      raw.prepare("UPDATE invoices SET paid_paise=paid_paise+?,status=CASE WHEN paid_paise+?=total_paise THEN 'paid' ELSE 'part_paid' END WHERE id=? AND owner_user_id=?").bind(amountPaise,amountPaise,invoice.id,user.id),
      raw.prepare("INSERT INTO invoice_payments (id,owner_user_id,invoice_id,invoice_number,customer_name,payment_date,amount_paise,payment_mode,reference,journal_entry_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,invoice.id,invoice.invoice_number,invoice.customer_name,parsed.data.paymentDate,amountPaise,parsed.data.paymentMode,parsed.data.reference||null,journal.id,Date.now()),
      ...journal.statements,
    ]);
    return NextResponse.json({ message: `Receipt saved as ${journal.number}.`, outstandingPaise: outstanding - amountPaise }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    if (error instanceof Error && error.message.includes("INVOICE_PAYMENT_OUT_OF_RANGE")) return NextResponse.json({ message: "Another receipt changed this invoice. Refresh and enter no more than the latest balance." }, { status: 409 });
    console.error("Receipt save failed", error);
    return NextResponse.json({ message: "The receipt could not be saved." }, { status: 500 });
  }
}
