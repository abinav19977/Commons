"use client";
import { companyFetch } from "@/app/company-fetch";
import { todayIST } from "@/app/lib/date";
import { FormEvent, useState } from "react";
type DocumentType = "sales_return" | "purchase_return" | "credit_note" | "debit_note";
const types = [
  { id: "sales_return" as const, label: "Customer returned goods", detail: "Stock comes back and customer balance reduces" },
  { id: "purchase_return" as const, label: "Returned goods to supplier", detail: "Stock reduces and supplier balance reduces" },
  { id: "credit_note" as const, label: "Give customer a credit", detail: "Reduce a bill without deleting it" },
  { id: "debit_note" as const, label: "Claim credit from supplier", detail: "Reduce what you owe a supplier" },
];
export default function AdjustmentForm({ products }: { products: Array<{ id: string; name: string; unit: string }> }) {
  const [type, setType] = useState<DocumentType>("sales_return");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMsg(""); setError(""); const form = new FormData(event.currentTarget);
    const selected = products.find((product) => product.id === form.get("productId"));
    const response = await companyFetch("/api/accounts/adjustments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentType: type, documentDate: form.get("documentDate"), originalReference: form.get("originalReference"), partyName: form.get("partyName"), taxableAmount: form.get("taxableAmount"), gstAmount: form.get("gstAmount"), reason: form.get("reason"), productId: form.get("productId"), quantity: form.get("quantity"), unit: selected?.unit || "PCS" }) });
    const body = await response.json(); setBusy(false); if (!response.ok) { setError(body.message || "Could not save."); return; }
    setMsg(`Saved ${body.number}. The original record remains unchanged.`); event.currentTarget.reset();
  }
  const changesStock = type === "sales_return" || type === "purchase_return";
  return <form className="plain-book-form" onSubmit={submit}>
    <div className="document-choice">{types.map((item) => <button type="button" className={type === item.id ? "active" : ""} onClick={() => setType(item.id)} key={item.id}><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div>
    <div className="form-grid"><label><span>Date</span><input type="date" name="documentDate" defaultValue={todayIST()} required /></label><label><span>Original bill or purchase</span><input name="originalReference" placeholder="Invoice or purchase number" /></label><label><span>{type.includes("purchase") || type === "debit_note" ? "Supplier" : "Customer"}</span><input name="partyName" required /></label><label><span>Value before GST</span><div className="money-input"><b>₹</b><input name="taxableAmount" inputMode="decimal" required /></div></label><label><span>GST being reversed</span><div className="money-input"><b>₹</b><input name="gstAmount" inputMode="decimal" defaultValue="0" /></div></label>{changesStock && <><label><span>Returned product</span><select name="productId" defaultValue="" required><option value="" disabled>Select a product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label><span>Quantity returned</span><input name="quantity" inputMode="decimal" min="0.001" step="0.001" required /></label></>}<label className="span-2"><span>Reason</span><textarea name="reason" required placeholder="Damaged item, pricing correction, cancelled service…" /></label></div>
    <p className="control-note">This creates a linked correction. Posted bills and audit history are never silently overwritten.</p>{error && <p className="form-error">{error}</p>}{msg && <p className="form-success">{msg}</p>}<button className="submit-button" disabled={busy}>{busy ? "Saving…" : "Create correction"}</button>
  </form>;
}
