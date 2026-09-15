import { BadgeIndianRupee, BookOpenCheck, HandCoins, Landmark } from "lucide-react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

export default async function FinancePage() {
  await requireChatGPTUser("/finance");
  const options = [
    { label: "Payment Advances", icon: HandCoins, href: "/finance/advances" },
    { label: "Salary Tracking", icon: BadgeIndianRupee, href: "/finance/payroll" },
    { label: "Bank Reconciliation", icon: Landmark, href: "/banking" },
    { label: "Commons Books", icon: BookOpenCheck, href: "/accounts" },
  ];
  return (
    <main className="workspace-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/" aria-label="Back to Commons"><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="workspace" aria-label="Finance options">
        <a className="back-link" href="/workspace">← Workspace</a>
        <nav className="tool-grid">
          {options.map(({ label, icon: Icon, href }, index) => (
            <a className="tool-tile" href={href} key={label}>
              <span className="tool-number">{(index + 1).toString().padStart(2, "0")}</span>
              <Icon aria-hidden="true" strokeWidth={1.45} />
              <span className="tool-label">{label}</span>
            </a>
          ))}
        </nav>
      </section>
      <CommonsAssistant context="finance" />
    </main>
  );
}
