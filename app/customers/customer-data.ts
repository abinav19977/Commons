export type CustomerView = {
  id: string;
  displayName: string;
  nickname: string | null;
  customerType: string;
  contactName: string | null;
  primaryPhone: string;
  secondaryPhone: string | null;
  email: string | null;
  gstRegistrationType: string;
  gstin: string | null;
  pan: string | null;
  bankAccountLast4: string | null;
  placeOfSupply: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPinCode: string | null;
  creditDays: number;
  creditLimitPaise: number;
  openingBalancePaise: number;
  balanceType: string;
  notes: string | null;
};

export type CustomerTransaction = {
  date: string;
  type: "Invoice" | "Payment";
  reference: string;
  amountPaise: number;
  status: "Paid" | "Due" | "Received";
};

export const demoCustomer: CustomerView = {
  id: "demo-aarav-traders",
  displayName: "Aarav Traders",
  nickname: "Aarav",
  customerType: "business",
  contactName: "Meera Shah",
  primaryPhone: "9876543210",
  secondaryPhone: "9820012345",
  email: "accounts@aaravtraders.in",
  gstRegistrationType: "regular",
  gstin: "27ABCDE1234F1Z5",
  pan: "ABCDE1234F",
  bankAccountLast4: "2187",
  placeOfSupply: "Maharashtra",
  billingAddressLine1: "42, Nariman Point",
  billingAddressLine2: "Maker Chambers",
  billingCity: "Mumbai",
  billingState: "Maharashtra",
  billingPinCode: "400021",
  creditDays: 30,
  creditLimitPaise: 20000000,
  openingBalancePaise: 0,
  balanceType: "receivable",
  notes: "Preferred billing contact: Meera Shah.",
};

export const demoTransactions: CustomerTransaction[] = [];

export const demoCustomers: CustomerView[] = [];

export const demoTransactionsByCustomer: Record<string, CustomerTransaction[]> =
  {};
