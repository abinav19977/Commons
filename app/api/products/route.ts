import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "../../../db";
import { products, suppliers } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../company-auth";
import { demoSuppliers } from "../../purchases/supplier-data";

export const dynamic = "force-dynamic";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");
const productSchema = z
  .object({
    itemType: z.enum([
      "product",
      "resale_product",
      "manufactured_product",
      "raw_material",
      "service",
    ]),
    name: z.string().trim().min(1, "Product name is required.").max(140),
    category: optionalText(100),
    sku: optionalText(50),
    barcode: optionalText(32),
    hsnSac: optionalText(8),
    unit: z.string().trim().min(1).max(12),
    purchasePrice: z.string().trim().optional().default("0"),
    salePrice: z.string().trim().optional().default("0"),
    gstRate: z.string().trim().optional().default("0"),
    cessRate: z.string().trim().optional().default("0"),
    priceIncludesTax: z.boolean(),
    openingStock: z.string().trim().optional().default("0"),
    reorderLevel: z.string().trim().optional().default("0"),
    warehouse: optionalText(100),
    supplier: optionalText(140),
    supplierId: optionalText(80),
    description: optionalText(1000),
    active: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.hsnSac && !/^[0-9]{4,8}$/.test(value.hsnSac)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hsnSac"],
        message: "Enter a valid 4 to 8 digit HSN or SAC code.",
      });
    }
    if (value.barcode && !/^[0-9A-Za-z-]{4,32}$/.test(value.barcode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barcode"],
        message: "Enter a valid barcode.",
      });
    }
  });

function toScaled(value: string, scale: number) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * scale);
}

function emptyToNull(value: string) {
  return value || null;
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
      { message: "The submitted form could not be read." },
      { status: 400 },
    );
  }

  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message || "Check the product details.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const purchasePricePaise = toScaled(data.purchasePrice, 100);
  const salePricePaise = toScaled(data.salePrice, 100);
  const gstRateBasisPoints = toScaled(data.gstRate, 100);
  const cessRateBasisPoints = toScaled(data.cessRate, 100);
  const openingStockMilli = toScaled(data.openingStock, 1000);
  const reorderLevelMilli = toScaled(data.reorderLevel, 1000);
  if (
    [
      purchasePricePaise,
      salePricePaise,
      gstRateBasisPoints,
      cessRateBasisPoints,
      openingStockMilli,
      reorderLevelMilli,
    ].some((value) => value === null)
  ) {
    return NextResponse.json(
      { message: "Check the price, tax and stock values." },
      { status: 400 },
    );
  }

  const now = new Date();
  let supplierId: string | null = null;
  let supplierName = data.supplier;
  if (data.supplierId) {
    const demoSupplier = demoSuppliers.find((item) => item.id === data.supplierId);
    if (demoSupplier) {
      supplierId = demoSupplier.id;
      supplierName = demoSupplier.name;
    } else {
      const [savedSupplier] = await getDb()
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, data.supplierId),
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
    }
  }
  const id = crypto.randomUUID();
  try {
    await getDb()
      .insert(products)
      .values({
        id,
        ownerUserId: user.id,
        itemType: data.itemType,
        name: data.name,
        category: emptyToNull(data.category),
        sku: emptyToNull(data.sku.toUpperCase()),
        barcode: emptyToNull(data.barcode),
        hsnSac: emptyToNull(data.hsnSac),
        unit: data.unit,
        purchasePricePaise: purchasePricePaise!,
        salePricePaise: salePricePaise!,
        priceIncludesTax: data.priceIncludesTax,
        gstRateBasisPoints: gstRateBasisPoints!,
        cessRateBasisPoints: cessRateBasisPoints!,
        openingStockMilli: openingStockMilli!,
        reorderLevelMilli: reorderLevelMilli!,
        warehouse: emptyToNull(data.warehouse),
        supplier: emptyToNull(supplierName),
        supplierId,
        description: emptyToNull(data.description),
        active: data.active,
        createdAt: now,
        updatedAt: now,
      });
  } catch (error) {
    console.error("Product save failed", error);
    const message =
      error instanceof Error && error.message.includes("UNIQUE")
        ? "A product with this SKU already exists."
        : "Product could not be saved. Please try again.";
    return NextResponse.json({ message }, { status: 500 });
  }

  return NextResponse.json(
    { id, message: "Product saved successfully." },
    { status: 201 },
  );
}
