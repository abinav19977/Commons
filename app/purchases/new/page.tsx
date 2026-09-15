import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../../../db";
import { purchaseItems, purchases } from "../../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { demoProducts } from "../../products/product-data";
import { listProducts } from "../../products/product-store";
import { demoSuppliers, type SupplierView } from "../supplier-data";
import { findSupplier } from "../supplier-store";
import PurchaseForm, {
  type PurchaseDraft,
  type PurchaseSupplier,
} from "./purchase-form";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

type PageProps = {
  searchParams: Promise<{
    repeat?: string | string[];
    supplierId?: string | string[];
  }>;
};

function value(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}

function supplierForPurchase(supplier: SupplierView): PurchaseSupplier {
  return {
    id: supplier.id,
    name: supplier.name,
    gstin: supplier.gstin || "",
    primaryPhone: supplier.primaryPhone,
    state: supplier.state || "",
  };
}

export default async function NewPurchasePage({ searchParams }: PageProps) {
  const user = await requireChatGPTUser("/purchases/new");
  const params = await searchParams;
  const repeatId = value(params.repeat);
  const requestedSupplierId = value(params.supplierId);
  let supplier: PurchaseSupplier | null = null;
  let initialPurchase: PurchaseDraft | null = null;
  let repeatedProductIds = new Set<string>();

  if (repeatId) {
    try {
      const db = getDb();
      const [purchase] = await db
        .select()
        .from(purchases)
        .where(and(eq(purchases.id, repeatId), eq(purchases.ownerUserId, user.id)))
        .limit(1);
      if (purchase) {
        const previousLines = await db
          .select()
          .from(purchaseItems)
          .where(
            and(
              eq(purchaseItems.purchaseId, purchase.id),
              eq(purchaseItems.ownerUserId, user.id),
            ),
          )
          .orderBy(asc(purchaseItems.position));
        repeatedProductIds = new Set(previousLines.map((item) => item.productId));
        if (purchase.supplierId) {
          const found =
            demoSuppliers.find((item) => item.id === purchase.supplierId) ||
            (await findSupplier(user.id, purchase.supplierId));
          if (found) supplier = supplierForPurchase(found);
        }
        supplier ||= {
          id: purchase.supplierId || "",
          name: purchase.supplierName,
          gstin: purchase.supplierGstin || "",
          primaryPhone: "",
          state: "",
        };
        initialPurchase = {
          sourceNumber: purchase.purchaseNumber,
          supplierId: purchase.supplierId || "",
          supplierName: purchase.supplierName,
          supplierGstin: purchase.supplierGstin || "",
          status: purchase.status === "ordered" ? "ordered" : "received",
          notes: purchase.notes || "",
          lines: previousLines.map((item) => ({
            productId: item.productId,
            quantity: (item.quantityMilli / 1000).toString(),
            unitCost: (item.unitCostPaise / 100).toFixed(2),
            gstRate: (item.gstRateBasisPoints / 100).toString(),
          })),
        };
      }
    } catch (error) {
      console.error("Repeat purchase unavailable", error);
    }
  }

  if (!supplier && requestedSupplierId) {
    const found =
      demoSuppliers.find((item) => item.id === requestedSupplierId) ||
      (await findSupplier(user.id, requestedSupplierId));
    if (found) supplier = supplierForPurchase(found);
  }
  if (!supplier) redirect("/purchases/suppliers");

  const saved = await listProducts(user.id);
  const items = saved
    .filter(
      (item) =>
        item.itemType !== "service" &&
        item.itemType !== "manufactured_product" &&
        (item.supplierId === supplier.id ||
          (!item.supplierId && item.supplier === supplier.name) ||
          repeatedProductIds.has(item.id)),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      unit: item.unit,
      purchasePricePaise: item.purchasePricePaise,
      gstRateBasisPoints: item.gstRateBasisPoints,
    }));
  const availableIds = new Set(items.map((item) => item.id));
  if (initialPurchase)
    initialPurchase.lines = initialPurchase.lines.filter((line) =>
      availableIds.has(line.productId),
    );

  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href={supplier.id ? `/purchases/suppliers/${supplier.id}` : "/purchases/suppliers"} aria-label={`Back to ${supplier.name}`}><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="bill-wrap">
        <a className="back-link" href={supplier.id ? `/purchases/suppliers/${supplier.id}` : "/purchases/suppliers"}>← {supplier.name}</a>
        <PurchaseForm products={items} supplier={supplier} initialPurchase={initialPurchase} />
      </section>
      <CommonsAssistant context="purchases" />
    </main>
  );
}
