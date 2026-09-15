export type SupplierView = {
  id: string;
  name: string;
  contactName: string | null;
  primaryPhone: string;
  secondaryPhone: string | null;
  email: string | null;
  gstRegistrationType: string;
  gstin: string | null;
  pan: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  paymentTermsDays: number;
  openingPayablePaise: number;
  notes: string | null;
  active: boolean;
};

export const demoSuppliers: SupplierView[] = [];
