import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { manualEntry, rupeesToPaise, simpleEntry } from "../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../lib/book-server";

const schema = z.object({
  kind: z.enum(["money_in", "money_out", "transfer", "adjustment"]),
  entryDate: z.string().length(10),
  amount: z.string(),
  category: z.string().trim().max(40).optional().default(""),
  partyName: z.string().trim().max(160).optional().default(""),
  reference: z.string().trim().max(100).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  cash: z.boolean().optional().default(false),
  debitAccount: z.string().trim().max(4).optional().default(""),
  creditAccount: z.string().trim().max(4).optional().default(""),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the transaction details." }, { status: 400 });
  const amountPaise = rupeesToPaise(parsed.data.amount);
  if (!amountPaise) return NextResponse.json({ message: "Enter an amount greater than zero." }, { status: 400 });
  try {
    await assertPeriodOpen(user.id, parsed.data.entryDate);
    const label = parsed.data.kind === "money_in" ? "Money received" : parsed.data.kind === "money_out" ? "Money paid" : parsed.data.kind === "transfer" ? "Cash moved from bank" : "Accountant adjustment";
    const description = [label, parsed.data.partyName, parsed.data.reference, parsed.data.note].filter(Boolean).join(" · ");
    const lines = parsed.data.kind === "adjustment"
      ? manualEntry(parsed.data.debitAccount, parsed.data.creditAccount, amountPaise)
      : simpleEntry(parsed.data.kind, amountPaise, { cash: parsed.data.cash, category: parsed.data.category });
    if (!lines) return NextResponse.json({ message: "Choose two different valid money categories." }, { status: 400 });
    const journal = await prepareJournal({
      ownerUserId: user.id,
      actor: user.email,
      entryDate: parsed.data.entryDate,
      sourceType: parsed.data.kind,
      description,
      lines,
    });
    await getRawDb().batch(journal.statements);
    return NextResponse.json({ id: journal.id, number: journal.number }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") {
      return NextResponse.json({ message: "This accounting period is locked. Ask the owner or accountant to reopen it." }, { status: 409 });
    }
    console.error("Book entry failed", error);
    return NextResponse.json({ message: "The entry could not be saved." }, { status: 500 });
  }
}
