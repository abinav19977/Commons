import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { rupeesToPaise } from "../../../lib/accounting";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("warehouse"), name: z.string().trim().min(2).max(100), code: z.string().trim().min(2).max(20), address: z.string().trim().max(300).optional().default("") }),
  z.object({ action: z.literal("batch"), productId: z.string().trim().min(1).max(80), productName: z.string().trim().min(1).max(160), warehouseId: z.string().trim().min(1).max(80), warehouseName: z.string().trim().min(1).max(100), batchNumber: z.string().trim().min(1).max(80), manufacturedDate: z.string().max(10).optional().default(""), expiryDate: z.string().max(10).optional().default(""), quantity: z.string(), unit: z.string().trim().min(1).max(12), unitCost: z.string() }),
]);

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the warehouse or batch details." }, { status: 400 });
  const d = parsed.data;
  const raw = getRawDb();
  const now = Date.now();
  try {
    if (d.action === "warehouse") {
      const id = crypto.randomUUID();
      await raw.prepare("INSERT INTO warehouses (id,owner_user_id,code,name,address,is_default,active,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, user.id, d.code.toUpperCase(), d.name, d.address || null, 0, 1, now).run();
      return NextResponse.json({ id }, { status: 201 });
    }
    const quantityMilli = Math.round(Number(d.quantity) * 1000);
    const unitCost = rupeesToPaise(d.unitCost);
    if (!Number.isFinite(quantityMilli) || quantityMilli <= 0 || unitCost === null) return NextResponse.json({ message: "Enter valid quantity and cost." }, { status: 400 });
    const id = crypto.randomUUID();
    await raw.batch([
      raw.prepare("INSERT INTO inventory_batches (id,owner_user_id,product_id,product_name,warehouse_id,warehouse_name,batch_number,manufactured_date,expiry_date,quantity_milli,unit,unit_cost_paise,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, user.id, d.productId, d.productName, d.warehouseId, d.warehouseName, d.batchNumber, d.manufacturedDate || null, d.expiryDate || null, quantityMilli, d.unit, unitCost, now, now),
      raw.prepare("INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), user.id, d.productId, "batch_opening", new Date().toISOString().slice(0, 10), quantityMilli, d.unit, unitCost, Math.round((quantityMilli / 1000) * unitCost), null, d.batchNumber, `Batch added to ${d.warehouseName}`, now),
    ]);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("Inventory control failed", error);
    return NextResponse.json({ message: "Could not save. Check that the code or batch is unique." }, { status: 500 });
  }
}
