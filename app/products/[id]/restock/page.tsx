import { notFound } from "next/navigation";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../../company-auth";
import CommonsAssistant from "../../../components/commons-assistant";
import { demoProducts } from "../../product-data";
import { findProduct, listProducts } from "../../product-store";
import RestockForm from "./restock-form";

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

async function Restock({ id }: { id: string }) {
  const user = await requireChatGPTUser(
    `/products/${encodeURIComponent(id)}/restock`,
  );
  const product =
    demoProducts.find((item) => item.id === id) ||
    (await findProduct(user.id, id));
  if (!product) notFound();
  const savedProducts = await listProducts(user.id);
  const materials = savedProducts.filter(
    (item) => item.itemType === "raw_material" && item.id !== product.id,
  );
  return <RestockForm product={product} materials={materials} />;
}

export default async function RestockPage({
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
          href={`/products/${id}`}
          aria-label="Back to product"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-form-wrap">
        <a className="back-link" href={`/products/${id}`}>
          ← Product details
        </a>
        <Restock id={id} />
      </section>
      <CommonsAssistant context="products" />
    </main>
  );
}
