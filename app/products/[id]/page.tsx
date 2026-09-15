import { notFound } from "next/navigation";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import { PackagePlus } from "lucide-react";
import {
  demoProductMovementsById,
  demoProducts,
  type ProductMovement,
  type ProductView,
} from "../product-data";
import { findProduct, listStockMovements } from "../product-store";
import CommonsAssistant from "../../components/commons-assistant";

export const dynamic = "force-dynamic";

function CommonsMark() {
  return (
    <svg
      className="brand-mark brand-mark-small"
      aria-hidden="true"
      viewBox="0 0 128 128"
      fill="none"
    >
      <path
        d="M99 34A47 47 0 1 0 99 94"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="square"
      />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function quantity(milli: number, unit: string) {
  return (
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
      milli / 1000,
    ) +
    " " +
    unit
  );
}

function percent(basisPoints: number) {
  return (
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
      basisPoints / 100,
    ) + "%"
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function MovementTable({
  movements,
  unit,
}: {
  movements: ProductMovement[];
  unit: string;
}) {
  if (!movements.length)
    return <div className="empty-transactions">No stock movements yet.</div>;
  return (
    <div className="transaction-table-wrap">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Reference / supplier</th>
            <th>Quantity</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.date + movement.reference}>
              <td>{movement.date}</td>
              <td>{movement.type}</td>
              <td>
                <strong>{movement.reference}</strong>
                {movement.supplier && (
                  <small className="movement-supplier">
                    {movement.supplier}
                  </small>
                )}
              </td>
              <td>
                {movement.quantityMilli > 0 ? "+" : ""}
                {quantity(movement.quantityMilli, unit)}
              </td>
              <td>{rupees(movement.valuePaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ProductDetail({ id }: { id: string }) {
  const user = await requireChatGPTUser("/products/" + encodeURIComponent(id));
  let product: ProductView | null =
    demoProducts.find((item) => item.id === id) || null;
  let movements: ProductMovement[] = product
    ? demoProductMovementsById[id] || []
    : [];
  let unavailable = false;
  if (!product) {
    try {
      [product, movements] = await Promise.all([
        findProduct(user.id, id),
        listStockMovements(user.id, id),
      ]);
    } catch (error) {
      console.error("Product detail unavailable", error);
      unavailable = true;
    }
  }
  if (product?.id.startsWith("demo-")) {
    try {
      const savedDemoMovements = await listStockMovements(user.id, product.id);
      movements = [...movements, ...savedDemoMovements];
      product = {
        ...product,
        currentStockMilli:
          product.currentStockMilli +
          savedDemoMovements.reduce(
            (sum, movement) => sum + movement.quantityMilli,
            0,
          ),
      };
    } catch (error) {
      console.error("Demo stock movements unavailable", error);
    }
  }
  if (unavailable)
    return (
      <div className="record-unavailable">
        Product details are temporarily unavailable. Please try again.
      </div>
    );
  if (!product) notFound();

  const currentStockMilli = product.currentStockMilli;
  const inventoryValue = Math.round(
    (currentStockMilli / 1000) * product.purchasePricePaise,
  );

  return (
    <>
      <div className="customer-profile-heading">
        <span>
          {product.itemType.replaceAll("_", " ")} ·{" "}
          {product.active ? "Active" : "Inactive"}
        </span>
        <h1>{product.name}</h1>
        <div className="profile-heading-actions">
          <div className="profile-links">
            <a href="#summary">Summary</a>
            <a href="#movements">Stock movements</a>
          </div>
          {product.itemType !== "service" && (
            <a
              className="dashboard-primary compact-action"
              href={`/products/${product.id}/restock`}
            >
              <PackagePlus />
              Restock
            </a>
          )}
        </div>
      </div>
      <section
        id="summary"
        className="profile-section"
        aria-labelledby="product-summary-title"
      >
        <h2 id="product-summary-title">Summary</h2>
        <div className="summary-grid">
          <div>
            <span>Current stock</span>
            <strong>{quantity(currentStockMilli, product.unit)}</strong>
          </div>
          <div>
            <span>Selling price</span>
            <strong>{rupees(product.salePricePaise)}</strong>
          </div>
          <div>
            <span>Stock value</span>
            <strong>{rupees(inventoryValue)}</strong>
          </div>
          <div>
            <span>GST rate</span>
            <strong>{percent(product.gstRateBasisPoints)}</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <Detail label="SKU / item code" value={product.sku} />
          <Detail label="Barcode" value={product.barcode} />
          <Detail label="Category" value={product.category} />
          <Detail label="HSN / SAC" value={product.hsnSac} />
          <Detail label="Unit" value={product.unit} />
          <Detail
            label="Purchase price"
            value={rupees(product.purchasePricePaise)}
          />
          <Detail
            label="Tax setting"
            value={
              product.priceIncludesTax
                ? "Price includes GST"
                : "GST added separately"
            }
          />
          <Detail
            label="Cess rate"
            value={percent(product.cessRateBasisPoints)}
          />
          <Detail
            label="Reorder level"
            value={quantity(product.reorderLevelMilli, product.unit)}
          />
          <Detail label="Warehouse" value={product.warehouse} />
          <Detail label="Preferred supplier" value={product.supplier} />
          <Detail label="Description" value={product.description} />
        </dl>
      </section>
      <section
        id="movements"
        className="profile-section"
        aria-labelledby="movements-title"
      >
        <div className="section-heading">
          <h2 id="movements-title">Stock movements</h2>
          <span>{movements.length.toString().padStart(2, "0")}</span>
        </div>
        <MovementTable movements={movements} unit={product.unit} />
      </section>
    </>
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/products/existing"
          aria-label="Back to product list"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-profile">
        <a className="back-link" href="/products/existing">
          ← Existing products
        </a>
        <ProductDetail id={id} />
      </section>
      <CommonsAssistant context="products" />
    </main>
  );
}
