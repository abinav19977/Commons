import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { suppliers } from "../../db/schema";
import type { SupplierView } from "./supplier-data";

function toSupplierView(
  supplier: typeof suppliers.$inferSelect,
): SupplierView {
  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    primaryPhone: supplier.primaryPhone,
    secondaryPhone: supplier.secondaryPhone,
    email: supplier.email,
    gstRegistrationType: supplier.gstRegistrationType,
    gstin: supplier.gstin,
    pan: supplier.pan,
    addressLine1: supplier.addressLine1,
    addressLine2: supplier.addressLine2,
    city: supplier.city,
    state: supplier.state,
    pinCode: supplier.pinCode,
    paymentTermsDays: supplier.paymentTermsDays,
    openingPayablePaise: supplier.openingPayablePaise,
    notes: supplier.notes,
    active: supplier.active,
  };
}

export async function listSuppliers(
  ownerUserId: string,
): Promise<SupplierView[]> {
  const rows = await getDb()
    .select()
    .from(suppliers)
    .where(eq(suppliers.ownerUserId, ownerUserId))
    .orderBy(asc(suppliers.name));
  return rows.map(toSupplierView);
}

export async function findSupplier(
  ownerUserId: string,
  id: string,
): Promise<SupplierView | null> {
  const [row] = await getDb()
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.ownerUserId, ownerUserId), eq(suppliers.id, id)))
    .limit(1);
  return row ? toSupplierView(row) : null;
}
