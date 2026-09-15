import { FilePlus2, ReceiptText } from "lucide-react";
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
export default async function TransactionsPage() {
  await requireChatGPTUser("/transactions");
  const options = [
    { label: "Generate Bill", icon: FilePlus2, href: "/transactions/new" },
    {
      label: "All Transactions",
      icon: ReceiptText,
      href: "/transactions/existing",
    },
  ];
  return (
    <main className="workspace-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/" aria-label="Back to Commons">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="workspace">
        <a className="back-link" href="/workspace">
          ← Workspace
        </a>
        <nav className="tool-grid">
          {options.map(({ label, icon: Icon, href }, i) => (
            <a className="tool-tile" href={href} key={label}>
              <span className="tool-number">0{i + 1}</span>
              <Icon />
              <span className="tool-label">{label}</span>
            </a>
          ))}
        </nav>
      </section>
      <CommonsAssistant context="billing" />
    </main>
  );
}
