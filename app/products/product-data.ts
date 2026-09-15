export type ProductView = {
  id: string;
  itemType: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  hsnSac: string | null;
  unit: string;
  purchasePricePaise: number;
  salePricePaise: number;
  priceIncludesTax: boolean;
  gstRateBasisPoints: number;
  cessRateBasisPoints: number;
  openingStockMilli: number;
  currentStockMilli: number;
  reorderLevelMilli: number;
  warehouse: string | null;
  supplier: string | null;
  supplierId: string | null;
  description: string | null;
  active: boolean;
};

export type ProductMovement = {
  id: string;
  date: string;
  type:
    | "Opening"
    | "Sale"
    | "Purchase"
    | "Production"
    | "Consumption"
    | "Adjustment";
  reference: string;
  quantityMilli: number;
  valuePaise: number;
  supplier?: string | null;
  unitCostPaise?: number;
  notes?: string | null;
};

export const demoProduct: ProductView = {
  id: "demo-steel-bottle",
  itemType: "resale_product",
  name: "Stainless Steel Bottle 1L",
  sku: "SSB-1L-BLK",
  barcode: "8901234567890",
  category: "Drinkware",
  hsnSac: "73239390",
  unit: "PCS",
  purchasePricePaise: 52000,
  salePricePaise: 84900,
  priceIncludesTax: true,
  gstRateBasisPoints: 1800,
  cessRateBasisPoints: 0,
  openingStockMilli: 120000,
  currentStockMilli: 150000,
  reorderLevelMilli: 20000,
  warehouse: "Main Godown",
  supplier: "Bharat Homeware Pvt Ltd",
  supplierId: "demo-bharat-homeware",
  description: "Food-grade stainless steel bottle with leak-proof cap.",
  active: true,
};

export const demoProductMovements: ProductMovement[] = [];

export const demoProducts: ProductView[] = [];

export const demoProductMovementsById: Record<string, ProductMovement[]> = {};
