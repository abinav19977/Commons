import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import ProductForm from "./product-form";
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

export default async function NewProductPage() {
  await requireChatGPTUser("/products/new");
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
      <section className="customer-form-wrap" aria-label="New product">
        <a className="back-link" href="/products">
          ← Products
        </a>
        <ProductForm />
      </section>
      <CommonsAssistant context="products" />
    </main>
  );
}
