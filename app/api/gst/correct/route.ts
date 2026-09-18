import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { purchaseGstCorrectionEntry } from "../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../lib/book-server";

const schema = z.object({
  purchaseId: z.string().trim().min(1).max(100),
  itcEligible: z.boolean(),
  reverseCharge: z.boolean(),
});

// Applies a GST-treatment correction (typically found while reconciling GSTR-2B) to
// an already-posted purchase: updates its itc_eligible/reverse_charge flags and posts
// an adjusting journal entry for the difference, so the books and the GST
// classification can never permanently disagree the way they could before.
export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  if (!["owner", "accountant"].includes(user.role))
    return NextResponse.json({ message: "Owner or accountant access is required for this correction." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the correction details." }, { status: 400 });
  const { purchaseId, itcEligible, reverseCharge } = parsed.data;
  const raw = getRawDb();
  const purchase = await raw.prepare(
    "SELECT id,supplier_id,supplier_name,subtotal_paise,gst_paise,itc_eligible,reverse_charge,purchase_date FROM purchases WHERE id=? AND owner_user_id=?",
  ).bind(purchaseId, user.id).first<{ id: string; supplier_id: string | null; supplier_name: string; subtotal_paise: number; gst_paise: number; itc_eligible: number; reverse_charge: number; purchase_date: string }>();
  if (!purchase) return NextResponse.json({ message: "Purchase not found." }, { status: 404 });
  const fromItcEligible = Boolean(purchase.itc_eligible);
  const fromReverseCharge = Boolean(purchase.reverse_charge);
  if (fromItcEligible === itcEligible && fromReverseCharge === reverseCharge)
    return NextResponse.json({ message: "This purchase already has that GST treatment. Nothing to correct." }, { status: 400 });
  const correctionDate = new Date().toISOString().slice(0, 10);
  try {
    await assertPeriodOpen(user.id, correctionDate);
    const lines = purchaseGstCorrectionEntry(purchase.subtotal_paise, purchase.gst_paise, true, fromItcEligible, fromReverseCharge, itcEligible, reverseCharge)
      .map((line) => line.accountCode === "2000" ? { ...line, partyType: "supplier" as const, partyId: purchase.supplier_id, partyName: purchase.supplier_name } : line);
    const journal = await prepareJournal({
      ownerUserId: user.id,
      actor: user.email,
      entryDate: correctionDate,
      sourceType: "gst_correction",
      sourceId: purchase.id,
      description: `GST treatment corrected for purchase from ${purchase.supplier_name}`,
      lines,
    });
    await raw.batch([
      raw.prepare("UPDATE purchases SET itc_eligible=?, reverse_charge=? WHERE id=? AND owner_user_id=?").bind(itcEligible ? 1 : 0, reverseCharge ? 1 : 0, purchase.id, user.id),
      raw.prepare("UPDATE gst_2b_entries SET match_status='matched' WHERE owner_user_id=? AND matched_purchase_id=?").bind(user.id, purchase.id),
      ...journal.statements,
    ]);
    return NextResponse.json({ message: "GST treatment corrected and posted to the books." });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    console.error("GST correction failed", error);
    return NextResponse.json({ message: "The correction could not be saved." }, { status: 500 });
  }
}
