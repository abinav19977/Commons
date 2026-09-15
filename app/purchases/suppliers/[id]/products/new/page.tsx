import { notFound } from "next/navigation";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../../../../company-auth";
import CommonsAssistant from "../../../../../components/commons-assistant";
import ProductForm from "../../../../../products/new/product-form";
import { demoSuppliers } from "../../../../supplier-data";
import { findSupplier } from "../../../../supplier-store";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

export default async function SupplierProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/purchases/suppliers/${encodeURIComponent(id)}/products/new`);
  const supplier = demoSuppliers.find((item) => item.id === id) || await findSupplier(user.id, id);
  if (!supplier) notFound();
  const returnTo = `/purchases/suppliers/${supplier.id}`;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href={returnTo} aria-label={`Back to ${supplier.name}`}><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="customer-form-wrap" aria-label={`Add product for ${supplier.name}`}>
        <a className="back-link" href={returnTo}>← {supplier.name}</a>
        <div className="context-heading">
          <span>Supplier product</span>
          <strong>{supplier.name}</strong>
        </div>
        <ProductForm supplier={{ id: supplier.id, name: supplier.name }} returnTo={returnTo} />
      </section>
      <CommonsAssistant context="products" />
    </main>
  );
}
