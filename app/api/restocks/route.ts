import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getRawDb } from "../../../db";
import { products } from "../../../db/schema";
import { getChatGPTUser } from "../../company-auth";
import { demoProducts } from "../../products/product-data";
import { assertPeriodOpen, prepareJournal } from "../../lib/book-server";
import type { BookLine } from "../../lib/accounting";

const optional = (max: number) =>
  z.string().trim().max(max).optional().default("");
const schema = z.object({
  productId: z.string().trim().min(1).max(80),
  movementDate: z.string().trim().length(10),
  quantity: z.string().trim().min(1),
  unitCost: z.string().trim().min(1),
  supplier: optional(160),
  reference: optional(100),
  notes: optional(500),
  consumptions: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(80),
        quantity: z.string().trim().min(1),
      }),
    )
    .max(20)
    .optional()
    .default([]),
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
    return NextResponse.json(
      { message: "The restock entry could not be read." },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message || "Check the restock details.",
      },
      { status: 400 },
    );

  const data = parsed.data;
  const quantityMilli = Math.round(Number(data.quantity) * 1000);
  const unitCostPaise = Math.round(Number(data.unitCost) * 100);
  if (!Number.isFinite(quantityMilli) || quantityMilli <= 0)
    return NextResponse.json(
      { message: "Enter a restock quantity greater than zero." },
      { status: 400 },
    );
  if (!Number.isFinite(unitCostPaise) || unitCostPaise < 0)
    return NextResponse.json(
      { message: "Enter a valid unit cost." },
      { status: 400 },
    );

  const product =
    demoProducts.find((item) => item.id === data.productId) ||
    (
      await getDb()
        .select()
        .from(products)
        .where(
          and(
            eq(products.ownerUserId, user.id),
            eq(products.id, data.productId),
          ),
        )
        .limit(1)
    )[0];
  if (!product)
    return NextResponse.json(
      { message: "This product could not be found." },
      { status: 404 },
    );
  if (product.itemType === "service")
    return NextResponse.json(
      { message: "Services do not use stock quantities." },
      { status: 400 },
    );

  const materials = await Promise.all(
    data.consumptions.map(async (consumption) => {
      const quantity = Math.round(Number(consumption.quantity) * 1000);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const material =
        demoProducts.find((item) => item.id === consumption.productId) ||
        (
          await getDb()
            .select()
            .from(products)
            .where(
              and(
                eq(products.ownerUserId, user.id),
                eq(products.id, consumption.productId),
              ),
            )
            .limit(1)
        )[0];
      if (!material || material.itemType === "service") return null;
      return { material, quantity };
    }),
  );
  if (materials.some((item) => item === null))
    return NextResponse.json(
      { message: "Check every raw-material quantity and selection." },
      { status: 400 },
    );
  const validMaterials = materials.filter((item): item is NonNullable<typeof item> => item !== null);
  for (const item of validMaterials) {
    if (!item.material.id.startsWith("demo-")) {
      const balance = await getRawDb().prepare("SELECT COALESCE(SUM(quantity_milli),0) AS quantity FROM stock_movements WHERE owner_user_id = ? AND product_id = ?").bind(user.id, item.material.id).first<{ quantity:number }>();
      if ((balance?.quantity || 0) < item.quantity)
        return NextResponse.json({ message: `Not enough ${item.material.name} is available for this production.` }, { status: 400 });
    }
  }
  const isProduction = product.itemType === "manufactured_product";
  const materialValuePaise = validMaterials.reduce((sum, item) => sum + Math.round((item.quantity / 1000) * item.material.purchasePricePaise), 0);
  if (isProduction && materialValuePaise <= 0)
    return NextResponse.json({ message: "Add the raw materials consumed so Commons can value the finished stock." }, { status: 400 });
  const totalValuePaise = isProduction ? materialValuePaise : Math.round((quantityMilli / 1000) * unitCostPaise);
  const effectiveUnitCost = isProduction && quantityMilli ? Math.round(totalValuePaise / (quantityMilli / 1000)) : unitCostPaise;
  const reference =
    data.reference || `PROD-${data.movementDate.replaceAll("-", "")}`;
  const now = Date.now();
  const raw = getRawDb();
  try {
    await assertPeriodOpen(user.id, data.movementDate);
    const lines: BookLine[] = isProduction ? [
      { accountCode: "1200", accountName: "Stock on hand", debitPaise: totalValuePaise, creditPaise: 0 },
      { accountCode: "1200", accountName: "Stock on hand", debitPaise: 0, creditPaise: totalValuePaise },
    ] : [
      { accountCode: "1200", accountName: "Stock on hand", debitPaise: totalValuePaise, creditPaise: 0 },
      { accountCode: "2000", accountName: "Supplier money due", debitPaise: 0, creditPaise: totalValuePaise },
    ];
    const journal = await prepareJournal({ ownerUserId: user.id, actor: user.email, entryDate: data.movementDate, sourceType: isProduction ? "production" : "restock", sourceId: reference, description: isProduction ? `Produced ${product.name} · raw materials moved into finished stock` : `Restocked ${product.name} · ${data.supplier || "supplier due"}`, lines });
    await raw.batch([
      raw
        .prepare(
          "INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          product.id,
          isProduction
            ? "production"
            : "purchase",
          data.movementDate,
          quantityMilli,
          product.unit,
          effectiveUnitCost,
          totalValuePaise,
          data.supplier || product.supplier || null,
          reference,
          data.notes || null,
          now,
        ),
      ...validMaterials
        .map(({ material, quantity }) =>
          raw
            .prepare(
              "INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              user.id,
              material.id,
              "consumption",
              data.movementDate,
              -quantity,
              material.unit,
              material.purchasePricePaise,
              Math.round((quantity / 1000) * material.purchasePricePaise),
              null,
              reference,
              `Consumed to produce ${product.name}`,
              now,
            ),
        ),
      ...journal.statements,
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "PERIOD_LOCKED") return NextResponse.json({ message: "This accounting period is locked." }, { status: 409 });
    console.error("Restock save failed", error);
    return NextResponse.json(
      { message: "The restock could not be saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { message: "Stock updated successfully." },
    { status: 201 },
  );
}
