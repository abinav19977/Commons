import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getRawDb } from "../../../db";
import { businessProfiles } from "../../../db/schema";
import { getChatGPTUser } from "../../company-auth";
import { demoBusinessProfile } from "../../other/business/demo-profile";
import { salesEntry } from "../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../lib/book-server";
import { demoProducts } from "../../products/product-data";
import { listProducts, weightedAverageCost } from "../../products/product-store";
const o = (n: number) => z.string().trim().max(n).optional().default("");
const line = z.object({
  productId: o(80),
  description: z.string().trim().min(1).max(220),
  hsnSac: o(8),
  quantity: z.string(),
  unit: z.string().trim().min(1).max(12),
  rate: z.string(),
  gstRate: z.string(),
  cessRate: z.string().optional().default("0"),
});
const schema = z.object({
  invoiceDate: z.string().min(10).max(10),
  dueDate: o(10),
  customerId: o(80),
  customerName: z.string().trim().min(1).max(160),
  customerGstin: o(15),
  customerAddress: o(500),
  placeOfSupply: o(80),
  supplyType: z.enum(["intra_state", "inter_state"]),
  discount: z.string().optional().default("0"),
  notes: o(1000),
  lines: z.array(line).min(1).max(30),
});
const scaled = (v: string, s: number) => {
  const n = Number(v || 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * s) : null;
};

function fiscalYear(date: string) {
  const [year, month] = date.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

async function nextInvoiceNumber(ownerUserId: string, invoiceDate: string, configuredPrefix: string) {
  const raw = getRawDb();
  const year = fiscalYear(invoiceDate);
  const prefix = configuredPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "INV";
  const now = Date.now();
  await raw.prepare("INSERT OR IGNORE INTO invoice_sequences (owner_user_id,fiscal_year,prefix,next_number,updated_at) VALUES (?,?,?,?,?)")
    .bind(ownerUserId, year, prefix, 1, now).run();
  const assigned = await raw.prepare("UPDATE invoice_sequences SET next_number=next_number+1,updated_at=? WHERE owner_user_id=? AND fiscal_year=? AND prefix=? RETURNING next_number-1 AS number")
    .bind(now, ownerUserId, year, prefix).first<{ number: number }>();
  if (!assigned?.number) throw new Error("INVOICE_SEQUENCE_UNAVAILABLE");
  return `${prefix}/${year}/${String(assigned.number).padStart(5, "0")}`;
}
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
    return NextResponse.json(
      { message: "Invalid invoice data." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check the invoice." },
      { status: 400 },
    );
  const d = parsed.data;
  const profiles = await getDb()
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.ownerUserId, user.id))
    .limit(1);
  const profile = profiles[0] || demoBusinessProfile;
  const rawItems = d.lines.map((item, index) => {
    const quantity = scaled(item.quantity, 1000),
      rate = scaled(item.rate, 100),
      gst = scaled(item.gstRate, 100),
      cess = scaled(item.cessRate, 100);
    if (
      quantity === null ||
      rate === null ||
      gst === null ||
      cess === null ||
      quantity === 0
    )
      return null;
    const rawTaxable = Math.round((quantity / 1000) * rate);
    return { ...item, index, quantity, rate, gst, cess, rawTaxable };
  });
  if (rawItems.some((item) => item === null))
    return NextResponse.json(
      { message: "Check the quantity, rate and tax values for every item." },
      { status: 400 },
    );
  const validItems = rawItems.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );
  const subtotal = validItems.reduce((s, i) => s + i.rawTaxable, 0);
  const discount = scaled(d.discount, 100);
  if (discount === null || discount > subtotal)
    return NextResponse.json(
      { message: "Discount cannot exceed the subtotal." },
      { status: 400 },
    );
  let allocated = 0;
  const computed = validItems.map((item, index) => {
    const share =
      index === validItems.length - 1
        ? (discount || 0) - allocated
        : Math.round((discount || 0) * (item.rawTaxable / (subtotal || 1)));
    allocated += share;
    const taxable = Math.max(0, item.rawTaxable - share);
    const gstTax = Math.round(taxable * (item.gst / 10000));
    const cessTax = Math.round(taxable * (item.cess / 10000));
    return {
      ...item,
      taxable,
      gstTax,
      cessTax,
      tax: gstTax + cessTax,
      total: taxable + gstTax + cessTax,
    };
  });
  const gstTax = computed.reduce((s, i) => s + i.gstTax, 0);
  const cessTax = computed.reduce((s, i) => s + i.cessTax, 0);
  const cgst = d.supplyType === "intra_state" ? Math.floor(gstTax / 2) : 0;
  const sgst = d.supplyType === "intra_state" ? gstTax - cgst : 0;
  const igst = d.supplyType === "inter_state" ? gstTax : 0;
  const total = subtotal - (discount || 0) + gstTax + cessTax;
  const liveProducts = await listProducts(user.id);
  const productMap = new Map(liveProducts.map((product) => [product.id, product]));
  const requestedStock = new Map<string, number>();
  for (const item of computed) {
    if (item.productId) requestedStock.set(item.productId, (requestedStock.get(item.productId) || 0) + item.quantity);
  }
  for (const [productId, quantity] of requestedStock) {
    const product = productMap.get(productId) || demoProducts.find((candidate) => candidate.id === productId);
    if (!product) return NextResponse.json({ message: "One of the selected products no longer exists." }, { status: 400 });
    if (product.itemType !== "service" && quantity > product.currentStockMilli) {
      return NextResponse.json({
        message: `${product.name} has only ${(product.currentStockMilli / 1000).toLocaleString("en-IN")} ${product.unit} available. Restock it before saving this bill.`,
      }, { status: 409 });
    }
  }
  const averageCosts = new Map<string, number>();
  for (const productId of requestedStock.keys()) {
    const product = productMap.get(productId) || demoProducts.find((candidate) => candidate.id === productId);
    averageCosts.set(productId, productId.startsWith("demo-") ? product?.purchasePricePaise || 0 : await weightedAverageCost(user.id, productId));
  }
  const costs = computed.map((item) => {
    if (!item.productId) return 0;
    const product = productMap.get(item.productId) || demoProducts.find((candidate) => candidate.id === item.productId);
    if (!product || product.itemType === "service") return 0;
    return Math.round((item.quantity / 1000) * (averageCosts.get(item.productId) ?? product.purchasePricePaise));
  });
  const costOfGoods = costs.reduce((sum, cost) => sum + cost, 0);
  const id = crypto.randomUUID();
  try {
    await assertPeriodOpen(user.id, d.invoiceDate);
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED")
      return NextResponse.json({ message: "This accounting period is locked. Choose an open date." }, { status: 409 });
    throw error;
  }
  let invoiceNumber: string;
  try {
    invoiceNumber = await nextInvoiceNumber(user.id, d.invoiceDate, profile.invoicePrefix);
  } catch (error) {
    console.error("Invoice sequence failed", error);
    return NextResponse.json({ message: "The next invoice number could not be reserved. No bill was created." }, { status: 500 });
  }
  const now = Date.now();
  const raw = getRawDb();
  const statements = [
    raw
      .prepare(
        "INSERT INTO invoices (id,owner_user_id,invoice_number,invoice_date,due_date,customer_id,customer_name,customer_gstin,customer_address,place_of_supply,supply_type,seller_legal_name,seller_trade_name,seller_gstin,seller_pan,seller_address,seller_state,subtotal_paise,discount_paise,cgst_paise,sgst_paise,igst_paise,cess_paise,total_paise,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.id,
        invoiceNumber,
        d.invoiceDate,
        d.dueDate || null,
        d.customerId || null,
        d.customerName,
        d.customerGstin || null,
        d.customerAddress || null,
        d.placeOfSupply || null,
        d.supplyType,
        profile.legalName || null,
        profile.tradeName || null,
        profile.gstin || null,
        profile.pan || null,
        [profile.addressLine1, profile.addressLine2, profile.city, profile.state, profile.pinCode].filter(Boolean).join(", ") || null,
        profile.state || null,
        subtotal,
        discount || 0,
        cgst,
        sgst,
        igst,
        cessTax,
        total,
        "unpaid",
        d.notes || null,
        now,
      ),
    ...computed.map((item) =>
      raw
        .prepare(
          "INSERT INTO invoice_items (id,invoice_id,owner_user_id,product_id,description,hsn_sac,quantity_milli,unit,rate_paise,gst_rate_basis_points,taxable_paise,tax_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          user.id,
          item.productId || null,
          item.description,
          item.hsnSac || null,
          item.quantity,
          item.unit,
          item.rate,
          item.gst,
          item.taxable,
          item.tax,
          item.total,
          item.index,
        ),
    ),
    ...computed
      .filter((item) => item.productId && !item.productId.startsWith("demo-"))
      .map((item) =>
        raw
          .prepare(
            "INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            user.id,
            item.productId,
            "sale",
            d.invoiceDate,
            -item.quantity,
            item.unit,
            item.quantity ? Math.round((costs[item.index] || 0) / (item.quantity / 1000)) : 0,
            costs[item.index] || 0,
            null,
            invoiceNumber,
            "Automatically recorded from bill",
            now,
          ),
      ),
  ];
  try {
    await assertPeriodOpen(user.id, d.invoiceDate);
    const journal = await prepareJournal({
      ownerUserId: user.id,
      actor: user.email,
      entryDate: d.invoiceDate,
      sourceType: "sales_invoice",
      sourceId: id,
      description: `Sale ${invoiceNumber} to ${d.customerName}`,
      lines: salesEntry(subtotal - (discount || 0), gstTax + cessTax, false, costOfGoods).map((line) => line.accountCode === "1100" ? { ...line, partyType: "customer" as const, partyId: d.customerId || null, partyName: d.customerName } : line),
    });
    await raw.batch([...statements, ...journal.statements]);
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED")
      return NextResponse.json(
        { message: "This accounting period is locked. Choose an open date." },
        { status: 409 },
      );
    console.error("Invoice save failed", error);
    return NextResponse.json(
      { message: "The bill could not be saved. Please try again." },
      { status: 500 },
    );
  }
  return NextResponse.json({ id, invoiceNumber }, { status: 201 });
}
