"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Download, FileUp, ShieldCheck } from "lucide-react";
import type { BankBatchView, BankTransactionView } from "./banking-data";

type ImportResult = {
  importedCount: number;
  matchedCount: number;
  reviewCount: number;
  unmatchedCount: number;
  duplicateCount: number;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export default function BankReconciliation({
  transactions,
  batches,
  defaultAccountLast4,
}: {
  transactions: BankTransactionView[];
  batches: BankBatchView[];
  defaultAccountLast4: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountLast4, setAccountLast4] = useState(defaultAccountLast4);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const summary = useMemo(() => ({
    matched: transactions.filter((item) => item.status === "matched").length,
    review: transactions.filter((item) => item.status === "review").length,
    importedValue: transactions.reduce((sum, item) => sum + item.amountPaise, 0),
  }), [transactions]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("error");
      setMessage("Choose a CSV bank statement.");
      return;
    }
    setStatus("uploading");
    setMessage("");
    setResult(null);
    const body = new FormData();
    body.set("statement", file);
    body.set("statementAccountLast4", accountLast4);
    try {
      const response = await companyFetch("/api/bank-statements", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as ImportResult & { message?: string };
      if (!response.ok) throw new Error(data.message || "The statement could not be imported.");
      setResult(data);
      setStatus("idle");
      setMessage("Statement imported. High-confidence payments were completed automatically.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The statement could not be imported.");
    }
  }

  function downloadTemplate() {
    const csv = "Transaction Date,Description,Reference,Credit,Debit,Account Number,Counterparty Account\n2026-09-07,NEFT Customer INV-2026-001,UTR12345,8014.56,,XXXX4821,XXXX2187\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "commons-bank-statement-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="bank-summary">
        <div><span>Auto-matched</span><strong>{summary.matched}</strong><small>High-confidence receipts</small></div>
        <div><span>Needs review</span><strong>{summary.review}</strong><small>No records changed</small></div>
        <div><span>Imported value</span><strong>{money(summary.importedValue)}</strong><small>Credits and debits</small></div>
      </div>
      <div className="bank-layout">
        <section className="bank-ledger">
          <div className="section-heading"><h2>Reconciliation ledger</h2><span>{transactions.length.toString().padStart(2, "0")}</span></div>
          <div className="bank-list">
            {transactions.map((item) => (
              <article className="bank-row" key={item.id}>
                <span className={`bank-direction ${item.direction}`}>{item.direction === "credit" ? "CR" : "DR"}</span>
                <div className="bank-identity"><strong>{item.matchedEntityName || item.description || "Bank transaction"}</strong><span>{item.transactionDate} · {item.reference || "No reference"}</span><small>{item.matchReason}</small></div>
                <strong className="bank-amount">{money(item.amountPaise)}</strong>
                <span className={`bank-status ${item.status}`}>{item.status}</span>
              </article>
            ))}
          </div>
        </section>
        <aside className="bank-side">
          <form className="bank-upload" onSubmit={upload}>
            <span className="panel-kicker">Import statement</span>
            <h2>Reconcile CSV</h2>
            <div className="bank-safety"><ShieldCheck /><p>Only exact, uniquely identified incoming payments are completed. Ambiguous transactions remain in review.</p></div>
            <label><span>Business account last 4</span><input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={accountLast4} onChange={(event) => setAccountLast4(event.target.value.replace(/\D/g, ""))} placeholder="0000" required /></label>
            <label className="bank-file"><span>Bank statement CSV</span><input ref={fileRef} type="file" accept=".csv,text/csv" required /></label>
            <button className="dashboard-primary bank-import" disabled={status === "uploading"}><FileUp />{status === "uploading" ? "Reconciling…" : "Import & reconcile"}</button>
            <button className="bank-template" type="button" onClick={downloadTemplate}><Download />Download column template</button>
            <p className={`form-status ${status}`} role="status">{message}</p>
            {result && <div className="bank-import-result"><span><strong>{result.importedCount}</strong> imported</span><span><strong>{result.matchedCount}</strong> completed</span><span><strong>{result.reviewCount}</strong> review</span><span><strong>{result.duplicateCount}</strong> duplicates skipped</span></div>}
          </form>
          <section className="bank-batches">
            <span className="panel-kicker">Import history</span>
            <h2>Recent statements</h2>
            {batches.length ? batches.map((batch) => <div key={batch.id}><span><strong>{batch.sourceFilename}</strong><small>•••• {batch.statementAccountLast4 || "—"}</small></span><span><strong>{batch.importedCount}</strong><small>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(batch.createdAt))}</small></span></div>) : <p>No saved imports yet.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
