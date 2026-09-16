"use client";
import { companyFetch } from "@/app/company-fetch";
import { FormEvent, useState } from "react";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Check, SlidersHorizontal } from "lucide-react";

type Kind = "money_in" | "money_out" | "transfer" | "adjustment";
const choices = [
  { id: "money_in" as const, label: "Money received", detail: "Customer payment or other income", icon: ArrowDownToLine },
  { id: "money_out" as const, label: "Money paid", detail: "Supplier, salary or expense", icon: ArrowUpFromLine },
  { id: "transfer" as const, label: "Cash withdrawal", detail: "Move money from bank to cash", icon: ArrowRightLeft },
  { id: "adjustment" as const, label: "Correct the books", detail: "Accountant journal adjustment", icon: SlidersHorizontal },
];

export default function MoneyEntryForm({ initialKind = "money_in", accounts }: { initialKind?: Kind; accounts:{code:string;name:string}[] }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult("");
    const form = new FormData(event.currentTarget);
    const response = await companyFetch("/api/accounts/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, entryDate: form.get("entryDate"), amount: form.get("amount"), category: form.get("category"), partyName: form.get("partyName"), reference: form.get("reference"), note: form.get("note"), cash: form.get("cash") === "on", debitAccount: form.get("debitAccount"), creditAccount: form.get("creditAccount") }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setError(body.message || "Could not save."); return; }
    setResult(`Saved safely as ${body.number}`); event.currentTarget.reset();
  }
  return <form className="plain-book-form" onSubmit={submit}>
    <div className="event-choice">{choices.map(({ id, label, detail, icon: Icon }) => <button className={kind === id ? "active" : ""} type="button" onClick={() => setKind(id)} key={id}><Icon /><strong>{label}</strong><small>{detail}</small></button>)}</div>
    <div className="form-grid">
      <label><span>Date</span><input type="date" name="entryDate" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
      <label><span>Amount</span><div className="money-input"><b>₹</b><input inputMode="decimal" name="amount" placeholder="0.00" required /></div></label>
      {kind !== "transfer" && kind !== "adjustment" && <label><span>Why?</span><select name="category" defaultValue={kind === "money_in" ? "customer_payment" : "business_expense"}>{kind === "money_in" ? <><option value="customer_payment">Customer paid an invoice</option><option value="other_income">Other income</option></> : <><option value="supplier_payment">Paid a supplier</option><option value="salary">Paid salary</option><option value="business_expense">Business expense</option></>}</select></label>}
      {kind !== "transfer" && kind !== "adjustment" && <label><span>{kind === "money_in" ? "Received from" : "Paid to"}</span><input name="partyName" placeholder="Name (optional)" /></label>}
      {kind !== "transfer" && kind !== "adjustment" && <label className="check-field"><input type="checkbox" name="cash" /><span>Used cash instead of bank</span></label>}
      {kind === "adjustment" && <><label><span>Increase or charge</span><select name="debitAccount" defaultValue="6000">{accounts.map(account=><option key={`d-${account.code}`} value={account.code}>{account.code} · {account.name}</option>)}</select></label><label><span>Balance against</span><select name="creditAccount" defaultValue="1010">{accounts.map(account=><option key={`c-${account.code}`} value={account.code}>{account.code} · {account.name}</option>)}</select></label></>}
      <label><span>Reference</span><input name="reference" placeholder="UPI, cheque or receipt number" /></label>
      <label className="span-2"><span>Note</span><textarea name="note" placeholder="Optional detail for your accountant" /></label>
    </div>
    <div className="auto-book-preview"><Check /><div><strong>Books are created automatically</strong><span>{kind === "money_in" ? "Bank or cash increases · Customer balance or income is updated" : kind === "money_out" ? "Expense or supplier balance is updated · Bank or cash reduces" : kind === "transfer" ? "Cash increases · Bank balance reduces" : "A balanced journal voucher is created · Use only with accountant guidance"}</span></div></div>
    {error && <p className="form-error">{error}</p>}{result && <p className="form-success">{result}</p>}
    <button className="submit-button" disabled={busy}>{busy ? "Saving…" : "Save transaction"}</button>
  </form>;
}
