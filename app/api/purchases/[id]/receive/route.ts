import { NextResponse } from "next/server";
import { getRawDb } from "../../../../../db";
import { getChatGPTUser } from "../../../../company-auth";
import { purchaseEntry } from "../../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../../lib/book-server";

type PurchaseRow = {
  id: string;
  purchase_number: string;
  supplier_name: string;
  supplier_invoice_number: string | null;
  purchase_date: string;
  subtotal_paise: number;
  gst_paise: number;
  status: string;
};
type ItemRow = {
  product_id: string;
  description: string;
  quantity_milli: number;
  unit: string;
  unit_cost_paise: number;
  taxable_paise: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const { id } = await params;
  const raw = getRawDb();
  const purchase = await raw.prepare(
    "SELECT id,purchase_number,supplier_name,supplier_invoice_number,purchase_date,subtotal_paise,gst_paise,status FROM purchases WHERE id = ? AND owner_user_id = ? LIMIT 1",
  ).bind(id, user.id).first<PurchaseRow>();
  if (!purchase) return NextResponse.json({ message: "Purchase not found." }, { status: 404 });
  if (purchase.status !== "ordered") return NextResponse.json({ message: "This purchase is already received." }, { status: 409 });
  const result = await raw.prepare(
    "SELECT product_id,description,quantity_milli,unit,unit_cost_paise,taxable_paise FROM purchase_items WHERE purchase_id = ? AND owner_user_id = ? ORDER BY position",
  ).bind(id, user.id).all<ItemRow>();
  const items = result.results as ItemRow[];
  if (!items.length) return NextResponse.json({ message: "This purchase has no items." }, { status: 400 });
  try {
    await assertPeriodOpen(user.id, purchase.purchase_date);
    const journal = await prepareJournal({
      ownerUserId: user.id,
      actor: user.email,
      entryDate: purchase.purchase_date,
      sourceType: "purchase",
      sourceId: purchase.id,
      description: `Goods received · ${purchase.purchase_number} · ${purchase.supplier_name}`,
      lines: purchaseEntry(purchase.subtotal_paise, purchase.gst_paise),
    });
    const now = Date.now();
    await raw.batch([
      raw.prepare("UPDATE purchases SET status = 'received' WHERE id = ? AND owner_user_id = ? AND status = 'ordered'").bind(id, user.id),
      ...items.map((item: ItemRow) => raw.prepare(
        "INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(crypto.randomUUID(), user.id, item.product_id, "purchase", purchase.purchase_date, item.quantity_milli, item.unit, item.unit_cost_paise, item.taxable_paise, purchase.supplier_name, purchase.supplier_invoice_number || purchase.purchase_number, "Received against purchase order", now)),
      ...journal.statements,
    ]);
    return NextResponse.json({ message: "Goods received. Stock, input GST and supplier balance are now updated." });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "The purchase date is in a locked period." }, { status: 409 });
    console.error("Purchase receipt failed", error);
    return NextResponse.json({ message: "Could not receive this purchase." }, { status: 500 });
  }
}
