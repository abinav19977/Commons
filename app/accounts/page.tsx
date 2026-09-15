import { ArchiveRestore, ArrowLeftRight, BookOpenCheck, Boxes, FileClock, Landmark, ListTree, ScrollText, ReceiptIndianRupee, Scale } from "lucide-react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Mark() {
  return <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none"><path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15"/><path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7"/></svg>;
}

export default async function AccountsPage() {
  await requireChatGPTUser("/accounts");
  const options = [
    { label: "Record Money", detail: "Money in, money out or transfer", icon: BookOpenCheck, href: "/accounts/new" },
    { label: "Match a Receipt", detail: "Apply a payment to a customer bill", icon: ReceiptIndianRupee, href: "/accounts/receipts" },
    { label: "Opening Balances", detail: "Start from your present position", icon: Scale, href: "/accounts/opening" },
    { label: "Business Reports", detail: "Profit, balance and cash flow", icon: ScrollText, href: "/accounts/reports" },
    { label: "Money Categories", detail: "Simple chart of accounts", icon: ListTree, href: "/accounts/chart" },
    { label: "Returns & Corrections", detail: "Credit notes, debit notes and returns", icon: ArchiveRestore, href: "/accounts/returns" },
    { label: "Stock Locations", detail: "Warehouses, batches and expiry", icon: Boxes, href: "/accounts/inventory" },
    { label: "GST Connections", detail: "Returns, e-invoice and e-way bill", icon: Landmark, href: "/accounts/compliance" },
    { label: "Tally Sync", detail: "Import, export and reconcile with TallyPrime", icon: ArrowLeftRight, href: "/integrations/tally" },
    { label: "Safety & Access", detail: "Audit trail, locks, roles and backups", icon: FileClock, href: "/accounts/controls" },
  ];
  return <main className="workspace-shell">
    <header className="site-header workspace-header"><Link className="wordmark" href="/"><Mark /></Link><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
    <section className="workspace accounting-home">
      <Link className="back-link" href="/workspace">← Workspace</Link>
      <div className="accounting-intro"><span>Commons Books</span><h1>Tell us what happened.<br/>We’ll handle the accounting.</h1><p>Every saved activity creates a balanced, traceable entry in the background.</p></div>
      <nav className="accounting-grid" aria-label="Accounting tools">{options.map(({label,detail,icon:Icon,href},index)=><a className="accounting-card" href={href} key={label}><span>{String(index+1).padStart(2,"0")}</span><Icon/><div><strong>{label}</strong><small>{detail}</small></div></a>)}</nav>
      <div className="accounting-assurance"><span>✓ Double-entry checked</span><span>✓ Period-lock aware</span><span>✓ Append-only activity trail</span></div>
    </section>
    <CommonsAssistant context="accounts" />
  </main>;
}
