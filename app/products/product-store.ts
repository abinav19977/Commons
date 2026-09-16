import { and, asc, eq } from "drizzle-orm";
import { getDb, getRawDb } from "../../db";
import { products, stockMovements } from "../../db/schema";
import type { ProductMovement, ProductView } from "./product-data";

function toProductView(
  product: typeof products.$inferSelect,
  movementMilli = 0,
): ProductView {
  return {
    id: product.id,
    itemType: product.itemType,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    hsnSac: product.hsnSac,
    unit: product.unit,
    purchasePricePaise: product.purchasePricePaise,
    salePricePaise: product.salePricePaise,
    priceIncludesTax: product.priceIncludesTax,
    gstRateBasisPoints: product.gstRateBasisPoints,
    cessRateBasisPoints: product.cessRateBasisPoints,
    openingStockMilli: product.openingStockMilli,
    currentStockMilli: product.openingStockMilli + movementMilli,
    reorderLevelMilli: product.reorderLevelMilli,
    warehouse: product.warehouse,
    supplier: product.supplier,
    supplierId: product.supplierId,
    description: product.description,
    active: product.active,
  };
}

export async function listProducts(
  ownerUserId: string,
): Promise<ProductView[]> {
  const [rows, movementRows] = await Promise.all([
    getDb()
      .select()
      .from(products)
      .where(eq(products.ownerUserId, ownerUserId))
      .orderBy(asc(products.name)),
    getDb()
      .select({
        productId: stockMovements.productId,
        quantityMilli: stockMovements.quantityMilli,
      })
      .from(stockMovements)
      .where(eq(stockMovements.ownerUserId, ownerUserId)),
  ]);
  const totals = new Map<string, number>();
  for (const movement of movementRows)
    totals.set(
      movement.productId,
      (totals.get(movement.productId) || 0) + movement.quantityMilli,
    );
  return rows.map((row) => toProductView(row, totals.get(row.id) || 0));
}

export async function findProduct(
  ownerUserId: string,
  id: string,
): Promise<ProductView | null> {
  const [rows, movementRows] = await Promise.all([
    getDb()
      .select()
      .from(products)
      .where(and(eq(products.ownerUserId, ownerUserId), eq(products.id, id)))
      .limit(1),
    getDb()
      .select({ quantityMilli: stockMovements.quantityMilli })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.ownerUserId, ownerUserId),
          eq(stockMovements.productId, id),
        ),
      ),
  ]);
  const movementMilli = movementRows.reduce(
    (sum, movement) => sum + movement.quantityMilli,
    0,
  );
  return rows[0] ? toProductView(rows[0], movementMilli) : null;
}

export async function weightedAverageCost(
  ownerUserId: string,
  productId: string,
): Promise<number> {
  const row = await getRawDb().prepare(`
    SELECT p.opening_stock_milli,p.purchase_price_paise,
      COALESCE(SUM(sm.quantity_milli),0) movement_quantity,
      COALESCE(SUM(CASE WHEN sm.quantity_milli >= 0 THEN sm.total_value_paise ELSE -ABS(sm.total_value_paise) END),0) movement_value
    FROM products p
    LEFT JOIN stock_movements sm ON sm.owner_user_id=p.owner_user_id AND sm.product_id=p.id
    WHERE p.owner_user_id=? AND p.id=?
    GROUP BY p.id
  `).bind(ownerUserId, productId).first<Record<string, unknown>>();
  if (!row) return 0;
  const openingQuantity = Number(row.opening_stock_milli || 0);
  const openingCost = Number(row.purchase_price_paise || 0);
  const quantity = openingQuantity + Number(row.movement_quantity || 0);
  const value = Math.round((openingQuantity / 1000) * openingCost) + Number(row.movement_value || 0);
  return quantity > 0 && value >= 0 ? Math.round(value / (quantity / 1000)) : openingCost;
}

export async function listStockMovements(
  ownerUserId: string,
  productId: string,
): Promise<ProductMovement[]> {
  const rows = await getDb()
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.ownerUserId, ownerUserId),
        eq(stockMovements.productId, productId),
      ),
    )
    .orderBy(asc(stockMovements.movementDate), asc(stockMovements.createdAt));
  return rows.map((row) => ({
    id: row.id,
    date: new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(row.movementDate + "T00:00:00Z")),
    type:
      row.movementType === "purchase"
        ? "Purchase"
        : row.movementType === "sale"
          ? "Sale"
          : row.movementType === "production"
            ? "Production"
            : row.movementType === "consumption"
              ? "Consumption"
              : "Adjustment",
    reference: row.reference || "—",
    quantityMilli: row.quantityMilli,
    valuePaise: row.totalValuePaise,
    supplier: row.supplier,
    unitCostPaise: row.unitCostPaise,
    notes: row.notes,
  }));
}
