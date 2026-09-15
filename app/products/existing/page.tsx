import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import { type ProductView } from "../product-data";
import { listProducts } from "../product-store";
import CommonsAssistant from "../../components/commons-assistant";
import ListToolbar from "../../components/list-toolbar";

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

function quantity(milli: number, unit: string) {
  return (
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
      milli / 1000,
    ) +
    " " +
    unit
  );
}

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default async function ExistingProductsPage() {
  const user = await requireChatGPTUser("/products/existing");
  let savedProducts: ProductView[] = [];
  let unavailable = false;
  try {
    savedProducts = await listProducts(user.id);
  } catch (error) {
    console.error("Product list unavailable", error);
    unavailable = true;
  }
  const directory = savedProducts;

  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/products" aria-label="Back to Products">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section
        className="customer-directory product-directory"
        aria-labelledby="product-directory-title"
      >
        <a className="back-link" href="/products">
          ← Products
        </a>
        <div className="directory-heading">
          <h1 id="product-directory-title">Products</h1>
          <span>{directory.length.toString().padStart(2, "0")}</span>
        </div>
        {unavailable && (
          <p className="directory-notice">
            Saved products are temporarily unavailable.
          </p>
        )}
        <ListToolbar filters={[{label:"Services",value:"Service"},{label:"Physical products",value:"PCS"}]}/>
        <div className="customer-list">
          {directory.map((product, index) => (
            <a
              className="customer-row product-row"
              href={"/products/" + product.id}
              key={product.id}
            >
              <span className="customer-index">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span className="customer-identity">
                <strong>{product.name}</strong>
                <small>{product.sku || product.category || "No SKU"}</small>
              </span>
              <span className="product-price">
                {rupees(product.salePricePaise)}
              </span>
              <span
                className={`product-stock ${product.currentStockMilli <= product.reorderLevelMilli && product.itemType !== "service" ? "low-stock" : ""}`}
              >
                {product.itemType === "service"
                  ? "Service"
                  : quantity(product.currentStockMilli, product.unit)}
              </span>
              <span className="customer-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </div>
      </section>
      <CommonsAssistant context="products" />
    </main>
  );
}
