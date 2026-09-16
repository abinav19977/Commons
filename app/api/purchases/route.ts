import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getRawDb } from "../../../db";
import { products, suppliers } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../company-auth";
import { demoProducts } from "../../products/product-data";
import { demoSuppliers } from "../../purchases/supplier-data";
import { purchaseEntry } from "../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../lib/book-server";
const line = z.object({
  productId: z.string().min(1).max(80),
  quantity: z.string(),
  unitCost: z.string(),
  gstRate: z.string(),
});
const schema = z.object({
  supplierId: z.string().trim().max(80).optional().default(""),
  supplierName: z.string().trim().min(1).max(160),
  supplierGstin: z.string().trim().max(15).optional().default(""),
  supplierInvoiceNumber: z.string().trim().max(100).optional().default(""),
  purchaseDate: z.string().length(10),
  status: z.enum(["received", "ordered"]),
  notes: z.string().trim().max(500).optional().default(""),
  lines: z.array(line).min(1).max(20),
});
export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json(
      { message: "Please sign in again." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid purchase." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check purchase details." },
      { status: 400 },
    );
  const d = parsed.data;
  let supplierId: string | null = null;
  let supplierName = d.supplierName;
  let supplierGstin = d.supplierGstin;
  if (d.supplierId) {
    const demoSupplier = demoSuppliers.find((item) => item.id === d.supplierId);
    if (demoSupplier) {
      supplierId = demoSupplier.id;
      supplierName = demoSupplier.name;
      supplierGstin = demoSupplier.gstin || "";
    } else {
      const [savedSupplier] = await getDb()
        .select({ id: suppliers.id, name: suppliers.name, gstin: suppliers.gstin })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, d.supplierId),
            eq(suppliers.ownerUserId, user.id),
          ),
        )
        .limit(1);
      if (!savedSupplier)
        return NextResponse.json(
          { message: "Select a valid supplier." },
          { status: 400 },
        );
      supplierId = savedSupplier.id;
      supplierName = savedSupplier.name;
      supplierGstin = savedSupplier.gstin || "";
    }
  }
  const resolved = await Promise.all(
    d.lines.map(async (line, index) => {
      const product =
        demoProducts.find((item) => item.id === line.productId) ||
        (
          await getDb()
            .select()
            .from(products)
            .where(
              and(
                eq(products.ownerUserId, user.id),
                eq(products.id, line.productId),
              ),
            )
            .limit(1)
        )[0];
      const quantity = Math.round(Number(line.quantity) * 1000),
        cost = Math.round(Number(line.unitCost) * 100),
        gst = Math.round(Number(line.gstRate) * 100);
      if (
        !product ||
        product.itemType === "service" ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        !Number.isFinite(gst) ||
        gst < 0
      )
        return null;
      const taxable = Math.round((quantity / 1000) * cost),
        tax = Math.round((taxable * gst) / 10000);
      return {
        product,
        quantity,
        cost,
        gst,
        taxable,
        tax,
        total: taxable + tax,
        index,
      };
    }),
  );
  if (resolved.some((item) => !item))
    return NextResponse.json(
      { message: "Check every purchase item." },
      { status: 400 },
    );
  const items = resolved.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const subtotal = items.reduce((s, i) => s + i.taxable, 0),
    gst = items.reduce((s, i) => s + i.tax, 0),
    total = subtotal + gst,
    id = crypto.randomUUID(),
    number = `PUR-${d.purchaseDate.slice(0, 4)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    now = Date.now(),
    raw = getRawDb();
  const statements = [
    raw
      .prepare(
        "INSERT INTO purchases (id,owner_user_id,purchase_number,supplier_id,supplier_name,supplier_gstin,supplier_invoice_number,purchase_date,subtotal_paise,gst_paise,total_paise,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.id,
        number,
        supplierId,
        supplierName,
        supplierGstin || null,
        d.supplierInvoiceNumber || null,
        d.purchaseDate,
        subtotal,
        gst,
        total,
        d.status,
        d.notes || null,
        now,
      ),
    ...items.map((i) =>
      raw
        .prepare(
          "INSERT INTO purchase_items (id,purchase_id,owner_user_id,product_id,description,quantity_milli,unit,unit_cost_paise,gst_rate_basis_points,taxable_paise,gst_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          i.product.id,
          i.product.name,
          i.quantity,
          i.product.unit,
          i.cost,
          i.gst,
          i.taxable,
          i.tax,
          i.total,
          i.index,
        ),
    ),
    ...(d.status === "received"
      ? items.map((i) =>
          raw
            .prepare(
              "INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              user.id,
              i.product.id,
              "purchase",
              d.purchaseDate,
              i.quantity,
              i.product.unit,
              i.cost,
              i.taxable,
              supplierName,
              d.supplierInvoiceNumber || number,
              "Recorded from purchase",
              now,
            ),
        )
      : []),
  ];
  try {
    if (d.status === "received") await assertPeriodOpen(user.id, d.purchaseDate);
    const journal = d.status === "received"
      ? await prepareJournal({
          ownerUserId: user.id,
          actor: user.email,
          entryDate: d.purchaseDate,
          sourceType: "purchase",
          sourceId: id,
          description: `Goods received · ${number} · ${supplierName}`,
          lines: purchaseEntry(subtotal, gst).map((line) => line.accountCode === "2000" ? { ...line, partyType: "supplier" as const, partyId: supplierId, partyName: supplierName } : line),
        })
      : null;
    await raw.batch([...statements, ...(journal?.statements || [])]);
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED")
      return NextResponse.json(
        { message: "This accounting period is locked. Choose an open date." },
        { status: 409 },
      );
    console.error("Purchase save failed", error);
    return NextResponse.json(
      { message: "Purchase could not be saved." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    id,
    number,
    message: d.status === "ordered"
      ? "Order saved. Stock and accounts will update only when goods are received."
      : "Purchase received. Stock, input GST and supplier balance are updated.",
  }, { status: 201 });
}
