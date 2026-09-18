import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, getRawDb } from "../../../../db";
import { customers, suppliers } from "../../../../db/schema";
import { getChatGPTUser } from "../../../company-auth";
import { CORE_ACCOUNTS, manualEntry, rupeesToPaise, simpleEntry } from "../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../lib/book-server";

const schema = z.object({
  kind: z.enum(["money_in", "money_out", "transfer", "adjustment"]),
  entryDate: z.string().length(10),
  amount: z.string(),
  category: z.string().trim().max(40).optional().default(""),
  partyName: z.string().trim().max(160).optional().default(""),
  customerId: z.string().trim().max(80).optional().default(""),
  supplierId: z.string().trim().max(80).optional().default(""),
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
  let partyId: string | null = null;
  let partyType: "customer" | "supplier" | null = null;
  if (parsed.data.customerId) {
    const [match] = await getDb().select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, parsed.data.customerId), eq(customers.ownerUserId, user.id))).limit(1);
    if (!match) return NextResponse.json({ message: "Select a valid customer." }, { status: 400 });
    partyId = match.id; partyType = "customer";
  } else if (parsed.data.supplierId) {
    const [match] = await getDb().select({ id: suppliers.id }).from(suppliers)
      .where(and(eq(suppliers.id, parsed.data.supplierId), eq(suppliers.ownerUserId, user.id))).limit(1);
    if (!match) return NextResponse.json({ message: "Select a valid supplier." }, { status: 400 });
    partyId = match.id; partyType = "supplier";
  }
  try {
    await assertPeriodOpen(user.id, parsed.data.entryDate);
    const label = parsed.data.kind === "money_in" ? "Money received" : parsed.data.kind === "money_out" ? "Money paid" : parsed.data.kind === "transfer" ? "Cash moved from bank" : "Accountant adjustment";
    const description = [label, parsed.data.partyName, parsed.data.reference, parsed.data.note].filter(Boolean).join(" · ");
    const customAccounts=(await getRawDb().prepare("SELECT code,name FROM ledger_accounts WHERE owner_user_id=? AND active=1").bind(user.id).all<{code:string;name:string}>()).results;
    const rawLines = parsed.data.kind === "adjustment"
      ? manualEntry(parsed.data.debitAccount, parsed.data.creditAccount, amountPaise, [...CORE_ACCOUNTS,...customAccounts])
      : simpleEntry(parsed.data.kind, amountPaise, { cash: parsed.data.cash, category: parsed.data.category });
    if (!rawLines) return NextResponse.json({ message: "Choose two different valid money categories." }, { status: 400 });
    const lines = partyId
      ? rawLines.map((line) => (line.accountCode === "1100" || line.accountCode === "2000") ? { ...line, partyType: partyType!, partyId, partyName: parsed.data.partyName || null } : line)
      : rawLines;
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
