import { ArrowLeftRight, BookOpenCheck, Building2, CircleHelp, FileText, PackagePlus, ReceiptIndianRupee, ShoppingCart, Sparkles, UsersRound } from "lucide-react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";

const steps = [
  { n: "01", title: "Tell Commons who you are", detail: "Add your legal name, GSTIN, address, bank details and invoice prefix. You do this once and can change it later.", href: "/other/business", action: "Set up business", icon: Building2, result: "Your bills use the correct business identity." },
  { n: "02", title: "Add customers and suppliers", detail: "Save the people you sell to and buy from. Nicknames help you group familiar names without changing the legal name.", href: "/customers", action: "Open customers", icon: UsersRound, result: "Every bill, due amount and payment stays linked to the right party." },
  { n: "03", title: "Add what you sell or use", detail: "Create products, services and raw materials. Enter the unit, price, HSN or SAC, GST rate and opening stock.", href: "/products", action: "Open products", icon: PackagePlus, result: "Commons can price bills, watch stock and calculate tax." },
  { n: "04", title: "Record what you buy", detail: "Choose a supplier and enter their invoice. Save as Ordered if goods are on the way; select Receive only after they arrive.", href: "/purchases", action: "Open purchases", icon: ShoppingCart, result: "Received goods update stock, input GST and supplier dues together." },
  { n: "05", title: "Create a customer bill", detail: "Choose the customer and items. Commons checks available stock and calculates CGST + SGST or IGST from the place of supply.", href: "/transactions/new", action: "Create bill", icon: FileText, result: "The invoice, stock movement, customer due and accounts are saved together." },
  { n: "06", title: "Record money received or paid", detail: "Match a receipt to its bill, or use Record Money for expenses and other payments. A bank statement is optional.", href: "/accounts/receipts", action: "Record receipt", icon: ReceiptIndianRupee, result: "Cash or bank and the related customer, supplier or expense balance update." },
  { n: "07", title: "Review before month-end", detail: "Check profit, balance sheet, GST, unmatched bank rows, returns and overdue amounts. Ask your accountant to review, then lock the period.", href: "/accounts", action: "Review accounts", icon: BookOpenCheck, result: "Your books stay balanced, traceable and ready for professional review." },
  { n: "08", title: "Exchange data with TallyPrime", detail: "Download Commons masters first and vouchers second, or upload a Tally voucher XML. Commons previews mappings, duplicates and balance errors before import.", href: "/integrations/tally", action: "Open Tally Sync", icon: ArrowLeftRight, result: "You can work in Commons while your accountant continues in Tally without retyping verified records." },
];

const glossary = [
  ["Money due from customers", "Receivables"], ["Money due to suppliers", "Payables"], ["Stock you currently own", "Inventory"], ["Tax collected on sales", "Output GST"], ["Eligible tax paid on purchases", "Input GST credit"], ["Two equal effects for every entry", "Double-entry"],
];

export default async function HelpPage() {
  await requireChatGPTUser("/help");
  return <main className="form-shell">
    <header className="site-header workspace-header"><a className="wordmark" href="/" aria-label="Commons home"><CircleHelp/></a><a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a></header>
    <section className="help-centre">
      <a className="back-link" href="/workspace">← Workspace</a>
      <div className="help-heading"><span>Commons Guide</span><h1>Run the business.<br/>The books follow.</h1><p>You record what happened in familiar words. Commons turns it into stock, tax and accounting records—without asking you to learn bookkeeping first.</p><div><a className="help-primary" href="/settings">Try with demo data</a><a href="#first-week">Your first week</a></div></div>
      <section className="help-principle"><Sparkles/><div><span>The simple rule</span><h2>Start with the real event, not the accounting entry.</h2><p>Sold something? Create a bill. Goods arrived? Receive the purchase. Customer paid? Record the receipt. Commons prepares the linked records and shows the result before anything important is saved.</p></div></section>
      <section className="help-steps">{steps.map(({ n, title, detail, href, action, icon: Icon, result }) => <article key={n}><span>{n}</span><Icon/><div><h2>{title}</h2><p>{detail}</p><small><b>What happens:</b> {result}</small><a href={href}>{action} →</a></div></article>)}</section>
      <section className="help-routine" id="first-week"><div><span>Every day</span><h2>Record the real events</h2><p>Create bills, receive purchases and record money. Deal with low-stock and overdue alerts from the dashboard.</p></div><div><span>Every week</span><h2>Clear the exceptions</h2><p>Review unmatched bank rows, overdue customers, supplier orders and pending salaries. Never approve a match you do not recognise.</p></div><div><span>Every month</span><h2>Close with confidence</h2><p>Review reports and GST working data. Correct mistakes with notes, get accountant approval, back up, then lock the period.</p></div></section>
      <section className="help-accounting"><div className="section-heading"><h2>Plain words → accounting words</h2></div><div>{glossary.map(([plain, term]) => <p key={term}><strong>{plain}</strong><span>{term}</span></p>)}</div></section>
      <section className="help-safety"><h2>Three controls that protect your books</h2><div><p><b>Preview first</b><span>The Copilot prepares the right screen. You confirm every financial save.</span></p><p><b>Correct, never erase</b><span>Use returns, credit notes or debit notes. The original audit trail remains.</span></p><p><b>Close reviewed periods</b><span>After your accountant checks the month, lock it to prevent accidental back-dated changes.</span></p></div></section>
      <p className="professional-note">Commons prepares management books and GST working data. A qualified chartered accountant should approve statutory filings and final financial statements.</p>
    </section><CommonsAssistant context="dashboard"/>
  </main>;
}
