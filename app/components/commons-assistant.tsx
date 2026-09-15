"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useState } from "react";
import { ArrowUpRight, Bot, CheckCircle2, Send, Sparkles, X } from "lucide-react";

type Context = "dashboard" | "customers" | "products" | "purchases" | "gst" | "receivables" | "finance" | "banking" | "billing" | "employees" | "business" | "accounts" | "tally";
type Action = { label: string; href: string; consequential?: boolean };
type Message = { role: "assistant" | "user"; text: string; action?: Action };

const contextStarters: Record<Context, string[]> = {
  dashboard: ["Create a bill", "What needs attention?", "Show profit"],
  customers: ["Add a customer", "GST or non-GST customer?", "Show overdue customers"],
  products: ["Add a product", "Show low stock", "How does production work?"],
  purchases: ["Record a purchase", "Add a supplier", "What does ordered mean?"],
  gst: ["Review GST", "Explain GSTR-3B", "What should my CA verify?"],
  receivables: ["Show overdue customers", "How do reminders work?", "Record a receipt"],
  finance: ["Prepare salary", "Record an advance", "Show cash position"],
  banking: ["Reconcile bank", "Can I enter money manually?", "Why is a row unmatched?"],
  billing: ["Create a GST bill", "Explain IGST", "What happens after I save?"],
  employees: ["Add an employee", "Prepare salary", "Record salary advance"],
  business: ["Set up my business", "What details are required?", "Open invoice settings"],
  accounts: ["Record money paid", "Show trial balance", "Explain double-entry"],
  tally: ["Export to Tally", "Import Tally vouchers", "How does live sync work?"],
};

const intents: Array<{ match: RegExp; answer: string; action: Action }> = [
  { match: /tally|tallyprime/i, answer: "I’ll open Tally Sync. You can export Commons masters and vouchers, preview an inbound Tally XML, resolve ledger issues and post only reviewed, balanced vouchers.", action: { label: "Open Tally Sync", href: "/integrations/tally" } },
  { match: /what.*(?:attention|priority)|today.*(?:attention|priority)/i, answer: "I’ll open today’s priorities: overdue money, low stock, unreconciled bank rows and compliance work that needs review.", action: { label: "View priorities", href: "/dashboard" } },
  { match: /(?:create|generate|make|new).*(?:bill|invoice)|(?:bill|invoice).*(?:create|generate|make)/i, answer: "I’ll take you to a new bill. Choose the customer and items; Commons will calculate tax, check stock and prepare the accounting entry before you save.", action: { label: "Create bill", href: "/transactions/new", consequential: true } },
  { match: /add.*customer|new customer/i, answer: "Let’s add the customer once, including their GST status, nickname and credit terms.", action: { label: "Add customer", href: "/customers/new", consequential: true } },
  { match: /gst or non-gst customer|customer.*(?:gst|unregistered)/i, answer: "Choose GST customer only when the buyer has a valid GSTIN. Unregistered buyers still receive a lawful invoice in their real name; Commons keeps both types in the same customer history.", action: { label: "Add customer", href: "/customers/new" } },
  { match: /(?:overdue|pending).*(?:customer|receivable)|(?:customer|receivable).*(?:overdue|pending)/i, answer: "I’ll open the collection queue, where you can review balances and approve each reminder before it is sent.", action: { label: "Open receivables", href: "/receivables" } },
  { match: /add.*(?:product|item)|new (?:product|item)/i, answer: "Let’s create the item with its HSN or SAC, tax rate, price, unit and stock rules.", action: { label: "Add product", href: "/products/new", consequential: true } },
  { match: /low stock|reorder|restock/i, answer: "I’ll open your stock list. Choose an item to buy more stock or record production with raw-material consumption.", action: { label: "Review stock", href: "/products/existing" } },
  { match: /add.*supplier|new supplier/i, answer: "Let’s add the supplier, tax details and payment terms before recording their products or purchases.", action: { label: "Add supplier", href: "/purchases/suppliers/new", consequential: true } },
  { match: /(?:record|new|add).*(?:purchase|raw material)|(?:purchase|raw material).*(?:record|add)/i, answer: "Choose the supplier first. Commons will keep an order outside the books until you confirm that the goods were received.", action: { label: "Choose supplier", href: "/purchases/suppliers" } },
  { match: /record.*(?:receipt|payment received)|customer paid/i, answer: "I’ll open receipt matching. Select the invoice, enter the amount and confirm; the customer balance and bank or cash account update together.", action: { label: "Record receipt", href: "/accounts/receipts", consequential: true } },
  { match: /record.*(?:paid|expense|money paid)|paid.*(?:supplier|expense|transport|rent|fuel)/i, answer: "I’ll prepare the money-paid form. Review the amount, purpose and payment source before saving the balanced entry.", action: { label: "Record money paid", href: "/accounts/new?kind=money_out", consequential: true } },
  { match: /reminder/i, answer: "Commons builds a reminder queue from overdue invoices and your thresholds. You review the customer, amount and wording before anything is sent.", action: { label: "Review reminders", href: "/receivables" } },
  { match: /(?:salary|payroll).*(?:prepare|pay|record)|(?:prepare|pay).*(?:salary|payroll)/i, answer: "I’ll open payroll. Confirm earnings, advance recovery and deductions before marking the salary paid.", action: { label: "Open payroll", href: "/finance/payroll", consequential: true } },
  { match: /advance/i, answer: "Commons tracks customer, supplier and employee advances separately until they are adjusted.", action: { label: "Open advances", href: "/finance/advances", consequential: true } },
  { match: /gst|gstr|input tax|output tax/i, answer: "I’ll open the GST workspace. It prepares filing working data and exceptions; reconcile GSTR-2B and obtain accountant approval before filing.", action: { label: "Review GST", href: "/gst" } },
  { match: /bank|reconcil/i, answer: "Bank upload is optional. Import a statement for matching, or record receipts and payments manually when you do not have one.", action: { label: "Open bank reconciliation", href: "/banking" } },
  { match: /profit|loss|balance sheet|trial balance|cash position|report/i, answer: "I’ll open the live reports built from posted journal entries. The balance check should remain zero.", action: { label: "Open reports", href: "/accounts/reports" } },
  { match: /return|credit note|debit note/i, answer: "Use a linked correction instead of editing a posted bill. Stock, GST and party balances are reversed together where applicable.", action: { label: "Create correction", href: "/accounts/returns", consequential: true } },
  { match: /setup|business profile|invoice setting/i, answer: "I’ll open your business identity, GST, bank and invoice defaults.", action: { label: "Open business profile", href: "/other/business", consequential: true } },
  { match: /help|how.*use|start/i, answer: "The Commons Guide explains the full journey in plain language, including what updates automatically and what your accountant must review.", action: { label: "Open Commons Guide", href: "/help" } },
];

function explain(input: string): string | null {
  const text = input.toLowerCase();
  if (text.includes("double") || text.includes("debit") || text.includes("credit")) return "Every business event has two equal effects. A sale increases customer dues and sales; a receipt increases bank or cash and reduces customer dues. Commons creates both sides and refuses an unbalanced entry.";
  if (text.includes("ordered")) return "Ordered means you have recorded the supplier order, but the goods have not arrived. It does not change stock, input GST or supplier dues. Use Receive when the items physically arrive.";
  if (text.includes("igst")) return "Use IGST for an inter-state supply. For an intra-state supply, GST is split into CGST and SGST. Confirm the place of supply before saving the invoice.";
  if (text.includes("non-gst") || text.includes("unregistered")) return "An unregistered customer can receive a valid bill without a GSTIN. The sale must still be recorded under the customer’s real name and included correctly in your GST working data—Commons does not create false or misleading bills.";
  if (text.includes("unmatched")) return "A bank row stays unmatched when the date, amount or reference is not strong enough to identify one business record. Review it manually so Commons never posts a guess.";
  if (text.includes("production") || text.includes("raw material")) return "Production restock adds finished goods and deducts the exact raw materials consumed. This protects stock quantities and keeps total inventory value balanced.";
  if (text.includes("what happens") && text.includes("save")) return "Before saving, Commons validates dates, amounts and stock. After confirmation it writes the business document, stock movement where relevant, balanced journal entry and audit event together.";
  return null;
}

export default function CommonsAssistant({ context }: { context: Context }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "Tell me what you want to do, in everyday language. I can explain it or prepare the right action." }]);
  async function ask(value: string) {
    const trimmed = value.trim(); if (!trimmed) return;
    const intent = intents.find((candidate) => candidate.match.test(trimmed));
    const local = intent?.answer || explain(trimmed);
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setInput("");
    if (local) {
      setMessages((current) => [...current, { role: "assistant", text: local, action: intent?.action }]);
      return;
    }
    setBusy(true);
    let answer = "I can prepare bills, purchases, receipts, payroll, GST reviews and reports. For open-ended questions, add an AI API key in Settings.";
    try {
      const saved = sessionStorage.getItem("commons.llm.session");
      const key = saved ? (JSON.parse(saved) as { apiKey?: string }).apiKey : "";
      if (key) {
        const response = await companyFetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-commons-ai-key": key },
          body: JSON.stringify({ question: trimmed, context }),
        });
        const body = await response.json().catch(() => ({})) as { answer?: string; message?: string };
        answer = response.ok && body.answer ? body.answer : body.message || answer;
      }
    } catch { /* retain the safe local answer */ }
    setBusy(false);
    setMessages((current) => [...current, { role: "assistant", text: answer, action: { label: "AI settings", href: "/settings" } }]);
  }
  function submit(event: FormEvent) { event.preventDefault(); ask(input); }
  return <>
    <button className="assistant-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open Commons Copilot"><Sparkles aria-hidden="true"/><span>Ask Commons</span></button>
    {open && <aside className="assistant-panel" aria-label="Commons Copilot">
      <header><div className="assistant-identity"><span className="assistant-orb"><Bot/></span><div><strong>Commons Copilot</strong><span>Understands · explains · prepares</span></div></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant"><X/></button></header>
      <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <div className={`assistant-message ${message.role}`} key={index}><p>{message.text}</p>{message.action && <a href={message.action.href}><span>{message.action.consequential && <CheckCircle2/>}{message.action.label}</span><ArrowUpRight/></a>}</div>)}</div>
      <div className="assistant-prompts">{contextStarters[context].map((prompt) => <button type="button" key={prompt} onClick={() => ask(prompt)} disabled={busy}>{prompt}</button>)}</div>
      <form onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={busy ? "Thinking…" : "Tell Commons what to do…"} aria-label="Message Commons" disabled={busy}/><button type="submit" aria-label="Send message" disabled={busy}><Send/></button></form>
      <small className="assistant-safety">You approve every financial change before it is saved.</small>
    </aside>}
  </>;
}
