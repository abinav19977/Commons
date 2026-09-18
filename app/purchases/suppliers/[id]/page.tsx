import { and, desc, eq, or } from "drizzle-orm";
import { PackagePlus, ShoppingCart } from "lucide-react";
import { notFound } from "next/navigation";
import { getDb, getRawDb } from "../../../../db";
import { purchases } from "../../../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../../company-auth";
import CommonsAssistant from "../../../components/commons-assistant";
import { type ProductView } from "../../../products/product-data";
import { listProducts } from "../../../products/product-store";
import { demoSuppliers, type SupplierView } from "../../supplier-data";
import { findSupplier } from "../../supplier-store";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

function address(supplier: SupplierView) {
  return [
    supplier.addressLine1,
    supplier.addressLine2,
    supplier.city,
    supplier.state,
    supplier.pinCode,
  ].filter(Boolean).join(", ") || "Not added";
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div className="detail-item"><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}

const demoPurchase = {
  id: "demo-purchase",
  purchaseNumber: "PUR-2026-014",
  purchaseDate: "2026-09-02",
  totalPaise: 2231250,
  status: "received",
};

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; productSaved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireChatGPTUser(`/purchases/suppliers/${encodeURIComponent(id)}`);
  let supplier = demoSuppliers.find((item) => item.id === id) || null;
  let unavailable = false;
  if (!supplier) {
    try {
      supplier = await findSupplier(user.id, id);
    } catch (error) {
      console.error("Supplier detail unavailable", error);
      unavailable = true;
    }
  }
  if (unavailable)
    return <main className="form-shell"><div className="record-unavailable">Supplier details are temporarily unavailable. Please try again.</div></main>;
  if (!supplier) notFound();

  let supplierProducts: ProductView[] = [];
  let supplierPurchases: Array<{
    id: string;
    purchaseNumber: string;
    purchaseDate: string;
    totalPaise: number;
    status: string;
  }> = [];
  try {
    const savedProducts = await listProducts(user.id);
    const bySupplier = (product: ProductView) =>
      product.supplierId === supplier.id ||
      (!product.supplierId && product.supplier === supplier.name);
    supplierProducts = savedProducts.filter(bySupplier);
    const rows = await getDb()
      .select({
        id: purchases.id,
        purchaseNumber: purchases.purchaseNumber,
        purchaseDate: purchases.purchaseDate,
        totalPaise: purchases.totalPaise,
        status: purchases.status,
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.ownerUserId, user.id),
          or(
            eq(purchases.supplierId, supplier.id),
            eq(purchases.supplierName, supplier.name),
          ),
        ),
      )
      .orderBy(desc(purchases.purchaseDate));
    supplierPurchases = [
      ...(supplier.id === "demo-green-loom" ? [demoPurchase] : []),
      ...rows,
    ];
  } catch (error) {
    console.error("Supplier activity unavailable", error);
  }
  const purchased = supplierPurchases.reduce((sum, item) => sum + item.totalPaise, 0);
  // Outstanding payable comes from the ledger itself (account "2000"), so it reflects
  // payments, debit notes and purchase returns, not just the sum of purchase totals.
  let outstandingPayable = 0;
  try {
    const row = await getRawDb()
      .prepare(
        "SELECT COALESCE(SUM(jl.credit_paise - jl.debit_paise),0) AS net FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE jl.owner_user_id = ? AND jl.party_id = ? AND jl.account_code = '2000' AND je.status = 'posted'",
      )
      .bind(user.id, supplier.id)
      .first<{ net: number }>();
    outstandingPayable = Math.max(0, (supplier.openingPayablePaise || 0) + (row?.net || 0));
  } catch (error) {
    console.error("Supplier payable balance unavailable", error);
  }

  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/purchases/suppliers" aria-label="Back to Suppliers"><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="customer-profile supplier-profile">
        <a className="back-link" href="/purchases/suppliers">← Existing suppliers</a>
        {(query.created || query.productSaved) && (
          <div className="purchase-saved" role="status">
            {query.created ? "Supplier saved successfully." : "Product added to this supplier."}
          </div>
        )}
        <div className="customer-profile-heading supplier-profile-heading">
          <span>{supplier.active ? "Active supplier" : "Inactive supplier"}</span>
          <h1>{supplier.name}</h1>
          <div className="supplier-primary-actions">
            <a className="dashboard-primary compact-action" href={`/purchases/suppliers/${supplier.id}/products/new`}>
              <PackagePlus /> Add product
            </a>
            <a className="dashboard-primary" href={`/purchases/new?supplierId=${encodeURIComponent(supplier.id)}`}>
              <ShoppingCart /> Record purchase
            </a>
          </div>
          <div className="profile-links">
            <a href="#summary">Summary</a>
            <a href="#products">Products</a>
            <a href="#purchase-history">Purchases</a>
          </div>
        </div>

        <section id="summary" className="profile-section" aria-labelledby="supplier-summary-title">
          <h2 id="supplier-summary-title">Summary</h2>
          <div className="summary-grid">
            <div><span>Outstanding payable</span><strong>{money(outstandingPayable)}</strong></div>
            <div><span>Total purchased</span><strong>{money(purchased)}</strong></div>
            <div><span>Purchases</span><strong>{supplierPurchases.length}</strong></div>
            <div><span>Products</span><strong>{supplierProducts.length}</strong></div>
            <div><span>Payment terms</span><strong>{supplier.paymentTermsDays} days</strong></div>
          </div>
          <dl className="detail-grid">
            <Detail label="Contact person" value={supplier.contactName} />
            <Detail label="Primary phone" value={`+91 ${supplier.primaryPhone}`} />
            <Detail label="Secondary phone" value={supplier.secondaryPhone ? `+91 ${supplier.secondaryPhone}` : null} />
            <Detail label="Email" value={supplier.email} />
            <Detail label="GSTIN" value={supplier.gstin} />
            <Detail label="PAN" value={supplier.pan} />
            <Detail label="GST registration" value={supplier.gstRegistrationType} />
            <Detail label="Address" value={address(supplier)} />
            <Detail label="Opening payable" value={money(supplier.openingPayablePaise)} />
            <Detail label="Notes" value={supplier.notes} />
          </dl>
        </section>

        <section id="products" className="profile-section" aria-labelledby="supplier-products-title">
          <div className="section-heading">
            <h2 id="supplier-products-title">Supplied products</h2>
            <span>{supplierProducts.length.toString().padStart(2, "0")}</span>
          </div>
          {supplierProducts.length ? (
            <div className="supplier-product-list">
              {supplierProducts.map((product) => (
                <a href={`/products/${product.id}`} key={product.id}>
                  <span><strong>{product.name}</strong><small>{product.itemType.replaceAll("_", " ")} · {product.sku || "No SKU"}</small></span>
                  <span>{product.currentStockMilli / 1000} {product.unit}</span>
                  <strong>{money(product.purchasePricePaise)}</strong>
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="empty-transactions supplier-empty">
              No products linked yet. <a href={`/purchases/suppliers/${supplier.id}/products/new`}>Add the first product</a>.
            </div>
          )}
        </section>

        <section id="purchase-history" className="profile-section" aria-labelledby="supplier-purchases-title">
          <div className="section-heading">
            <h2 id="supplier-purchases-title">Purchases</h2>
            <span>{supplierPurchases.length.toString().padStart(2, "0")}</span>
          </div>
          {supplierPurchases.length ? (
            <div className="transaction-table-wrap">
              <table className="transaction-table">
                <thead><tr><th>Date</th><th>Reference</th><th>Status</th><th>Amount</th><th /></tr></thead>
                <tbody>
                  {supplierPurchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{purchase.purchaseDate}</td>
                      <td>{purchase.purchaseNumber}</td>
                      <td className="capitalize">{purchase.status}</td>
                      <td>{money(purchase.totalPaise)}</td>
                      <td><a className="table-action" href={`/purchases/new?repeat=${encodeURIComponent(purchase.id)}`}>Repeat</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-transactions">No purchases yet.</div>}
        </section>
      </section>
      <CommonsAssistant context="purchases" />
    </main>
  );
}
