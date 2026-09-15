import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { customers } from "../../db/schema";
import type { CustomerView } from "./customer-data";

function toCustomerView(customer: typeof customers.$inferSelect): CustomerView {
  return {
    id: customer.id,
    displayName: customer.displayName,
    nickname: customer.nickname,
    customerType: customer.customerType,
    contactName: customer.contactName,
    primaryPhone: customer.primaryPhone,
    secondaryPhone: customer.secondaryPhone,
    email: customer.email,
    gstRegistrationType: customer.gstRegistrationType,
    gstin: customer.gstin,
    pan: customer.pan,
    bankAccountLast4: customer.bankAccountLast4,
    placeOfSupply: customer.placeOfSupply,
    billingAddressLine1: customer.billingAddressLine1,
    billingAddressLine2: customer.billingAddressLine2,
    billingCity: customer.billingCity,
    billingState: customer.billingState,
    billingPinCode: customer.billingPinCode,
    creditDays: customer.creditDays,
    creditLimitPaise: customer.creditLimitPaise,
    openingBalancePaise: customer.openingBalancePaise,
    balanceType: customer.balanceType,
    notes: customer.notes,
  };
}

export async function listCustomers(
  ownerUserId: string,
): Promise<CustomerView[]> {
  const rows = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.ownerUserId, ownerUserId))
    .orderBy(asc(customers.displayName));
  return rows.map(toCustomerView);
}

export async function findCustomer(
  ownerUserId: string,
  id: string,
): Promise<CustomerView | null> {
  const rows = await getDb()
    .select()
    .from(customers)
    .where(and(eq(customers.ownerUserId, ownerUserId), eq(customers.id, id)))
    .limit(1);
  return rows[0] ? toCustomerView(rows[0]) : null;
}
