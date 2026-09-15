import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { adjustmentEntry, rupeesToPaise } from "../../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../../lib/book-server";
import { findProduct } from "../../../products/product-store";

const schema = z.object({
  documentType: z.enum(["credit_note", "debit_note", "sales_return", "purchase_return"]),
  documentDate: z.string().length(10),
  originalReference: z.string().trim().max(100).optional().default(""),
  partyName: z.string().trim().min(1).max(160),
  taxableAmount: z.string(),
  gstAmount: z.string().optional().default("0"),
  reason: z.string().trim().min(3).max(500),
  productId: z.string().trim().max(80).optional().default(""),
  quantity: z.string().optional().default("0"),
  unit: z.string().trim().min(1).max(12).optional().default("PCS"),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the return or note details." }, { status: 400 });
  const d = parsed.data;
  const taxable = rupeesToPaise(d.taxableAmount);
  const gst = rupeesToPaise(d.gstAmount);
  const quantityMilli = Math.round(Number(d.quantity || 0) * 1000);
  if (!taxable || gst === null || !Number.isFinite(quantityMilli) || quantityMilli < 0) {
    return NextResponse.json({ message: "Enter valid amounts and quantity." }, { status: 400 });
  }
  try {
    await assertPeriodOpen(user.id, d.documentDate);
    const changesStock = d.documentType === "sales_return" || d.documentType === "purchase_return";
    if (changesStock && (!d.productId || quantityMilli <= 0)) {
      return NextResponse.json({ message: "Select the returned product and enter its quantity so stock and accounting stay aligned." }, { status: 400 });
    }
    const product = d.productId ? await findProduct(user.id, d.productId) : null;
    if (d.productId && !product) return NextResponse.json({ message: "Select a valid product." }, { status: 400 });
    if (d.documentType === "purchase_return" && product && quantityMilli > product.currentStockMilli) {
      return NextResponse.json({ message: `Only ${(product.currentStockMilli / 1000).toLocaleString("en-IN")} ${product.unit} is available to return.` }, { status: 409 });
    }
    const inventoryCost = product && quantityMilli > 0
      ? Math.round((quantityMilli / 1000) * product.purchasePricePaise)
      : 0;
    const id = crypto.randomUUID();
    const prefix = d.documentType === "credit_note" ? "CN" : d.documentType === "debit_note" ? "DN" : d.documentType === "sales_return" ? "SR" : "PR";
    const number = `${prefix}-${d.documentDate.slice(0, 4)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const now = Date.now();
    const description = `${d.documentType.replaceAll("_", " ")} · ${d.partyName} · ${d.reason}`;
    const journal = await prepareJournal({
      ownerUserId: user.id,
      actor: user.email,
      entryDate: d.documentDate,
      sourceType: d.documentType,
      sourceId: id,
      description,
      lines: adjustmentEntry(d.documentType, taxable, gst, inventoryCost),
    });
    const raw = getRawDb();
    const statements = [
      raw.prepare(
        "INSERT INTO adjustment_documents (id,owner_user_id,document_number,document_type,document_date,original_reference,party_name,product_id,quantity_milli,taxable_paise,gst_paise,total_paise,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(id, user.id, number, d.documentType, d.documentDate, d.originalReference || null, d.partyName, d.productId || null, quantityMilli, taxable, gst, taxable + gst, d.reason, "posted", now),
      ...journal.statements,
      ...(d.productId && quantityMilli > 0
        ? [raw.prepare(
            "INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          ).bind(crypto.randomUUID(), user.id, d.productId, d.documentType, d.documentDate, d.documentType === "sales_return" ? quantityMilli : -quantityMilli, d.unit, product?.purchasePricePaise || 0, inventoryCost, d.partyName, number, d.reason, now)]
        : []),
    ];
    await raw.batch(statements);
    return NextResponse.json({ id, number }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This period is locked." }, { status: 409 });
    console.error("Adjustment failed", error);
    return NextResponse.json({ message: "The return or note could not be saved." }, { status: 500 });
  }
}
