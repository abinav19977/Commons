export type InvoiceView = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  customerName: string;
  customerGstin: string | null;
  customerAddress: string | null;
  placeOfSupply: string | null;
  supplyType: string;
  sellerLegalName?: string | null;
  sellerTradeName?: string | null;
  sellerGstin?: string | null;
  sellerPan?: string | null;
  sellerAddress?: string | null;
  subtotalPaise: number;
  discountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalPaise: number;
  paidPaise: number;
  status: string;
  notes: string | null;
};
export type InvoiceItemView = {
  id: string;
  description: string;
  hsnSac: string | null;
  quantityMilli: number;
  unit: string;
  ratePaise: number;
  gstRateBasisPoints: number;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  position: number;
};
export const demoInvoice: InvoiceView = {
  id: "demo-invoice",
  invoiceNumber: "INV-2026-001",
  invoiceDate: "2026-09-03",
  dueDate: "2026-10-03",
  customerName: "Aarav Traders",
  customerGstin: "27ABCDE1234F1Z5",
  customerAddress:
    "42, Nariman Point, Maker Chambers, Mumbai, Maharashtra 400021",
  placeOfSupply: "Maharashtra",
  supplyType: "intra_state",
  subtotalPaise: 679200,
  discountPaise: 0,
  cgstPaise: 61128,
  sgstPaise: 61128,
  igstPaise: 0,
  cessPaise: 0,
  totalPaise: 801456,
  paidPaise: 0,
  status: "unpaid",
  notes: "Thank you for your business.",
};
export const demoInvoiceItems: InvoiceItemView[] = [];

export const demoInvoices: InvoiceView[] = [];

export const demoInvoiceItemsById: Record<string, InvoiceItemView[]> = {};
