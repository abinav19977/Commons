import { ArchiveRestore, Boxes, PackagePlus } from "lucide-react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";

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

export default async function ProductsPage() {
  await requireChatGPTUser("/products");
  const options = [
    { label: "New Product", icon: PackagePlus, href: "/products/new" },
    { label: "Existing Products", icon: Boxes, href: "/products/existing" },
    {
      label: "Restock Inventory",
      icon: ArchiveRestore,
      href: "/products/existing",
    },
  ];

  return (
    <main className="workspace-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/"
          aria-label="Back to Commons navigation"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="workspace" aria-label="Product options">
        <a className="back-link" href="/workspace">
          ← Workspace
        </a>
        <nav className="tool-grid" aria-label="Products">
          {options.map(({ label, icon: Icon, href }, index) => (
            <a className="tool-tile" href={href} key={label}>
              <span className="tool-number">0{index + 1}</span>
              <Icon aria-hidden="true" strokeWidth={1.45} />
              <span className="tool-label">{label}</span>
            </a>
          ))}
        </nav>
      </section>
      <CommonsAssistant context="products" />
    </main>
  );
}
