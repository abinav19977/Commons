"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useMemo, useState } from "react";
import { Save } from "lucide-react";
import type { AdvanceView } from "../finance-data";

export type AdvanceParty = {
  id: string;
  name: string;
  kind: "customer" | "supplier" | "employee";
};

const labels = {
  customer_received: "Customer advance received",
  supplier_paid: "Supplier advance paid",
  employee_paid: "Employee salary advance",
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

const today = () => new Date().toISOString().slice(0, 10);

export default function AdvanceWorkspace({
  initialAdvances,
  parties,
}: {
  initialAdvances: AdvanceView[];
  parties: AdvanceParty[];
}) {
  const [advanceType, setAdvanceType] = useState<AdvanceView["advanceType"]>("customer_received");
  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [advanceDate, setAdvanceDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [appliedAmount, setAppliedAmount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [applyingId, setApplyingId] = useState("");
  const [applicationAmount, setApplicationAmount] = useState("");

  const expectedKind =
    advanceType === "customer_received"
      ? "customer"
      : advanceType === "supplier_paid"
        ? "supplier"
        : "employee";
  const availableParties = parties.filter((party) => party.kind === expectedKind);
  const totals = useMemo(() => {
    const outstanding = (type: AdvanceView["advanceType"]) =>
      initialAdvances
        .filter((item) => item.advanceType === type)
        .reduce((sum, item) => sum + Math.max(0, item.amountPaise - item.appliedPaise), 0);
    return {
      customers: outstanding("customer_received"),
      suppliers: outstanding("supplier_paid"),
      employees: outstanding("employee_paid"),
    };
  }, [initialAdvances]);

  function chooseParty(value: string) {
    setPartyId(value);
    const selected = parties.find((party) => party.id === value);
    setPartyName(selected?.name || "");
  }

  function changeType(value: AdvanceView["advanceType"]) {
    setAdvanceType(value);
    setPartyId("");
    setPartyName("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await companyFetch("/api/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advanceType,
          partyId,
          partyName,
          advanceDate,
          amount: Number(amount),
          appliedAmount: Number(appliedAmount || 0),
          paymentMode,
          reference,
          purpose,
          notes,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not save the advance.");
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save the advance.");
    }
  }

  async function applyAdvance(item: AdvanceView) {
    setStatus("saving");
    setMessage("");
    try {
      const response = await companyFetch("/api/advances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, amount: Number(applicationAmount) }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not apply the advance.");
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not apply the advance.");
    }
  }

  return (
    <>
      <div className="finance-summary">
        <div><span>Customer advances available</span><strong>{money(totals.customers)}</strong><small>Liability until adjusted</small></div>
        <div><span>Supplier advances open</span><strong>{money(totals.suppliers)}</strong><small>Asset until billed</small></div>
        <div><span>Employee advances open</span><strong>{money(totals.employees)}</strong><small>Recoverable through payroll</small></div>
      </div>
      <div className="finance-layout">
        <section className="finance-ledger">
          <div className="section-heading"><h2>Advance ledger</h2><span>{initialAdvances.length.toString().padStart(2, "0")}</span></div>
          <div className="finance-list">
            {initialAdvances.map((item) => {
              const balance = Math.max(0, item.amountPaise - item.appliedPaise);
              return (
                <article className="finance-row-wrap" key={item.id}>
                  <div className="finance-row">
                  <div className="finance-row-primary">
                    <span>{labels[item.advanceType]}</span>
                    <strong>{item.partyName}</strong>
                    <small>{item.advanceDate} · {item.purpose || "General advance"}</small>
                  </div>
                  <div><span>Original</span><strong>{money(item.amountPaise)}</strong></div>
                  <div><span>Available</span><strong>{money(balance)}</strong></div>
                    <div className="finance-row-action">
                      <span className={`finance-status ${item.status}`}>{item.status}</span>
                      {!item.id.startsWith("demo-") && balance > 0 && (
                        <button type="button" onClick={() => { setApplyingId(item.id); setApplicationAmount(""); }}>Apply</button>
                      )}
                    </div>
                  </div>
                  {applyingId === item.id && (
                    <div className="advance-apply">
                      <label><span>Amount to apply ₹</span><input type="number" min="0.01" max={balance / 100} step="0.01" value={applicationAmount} onChange={(event) => setApplicationAmount(event.target.value)} autoFocus /></label>
                      <button type="button" disabled={!Number(applicationAmount) || status === "saving"} onClick={() => applyAdvance(item)}>Update balance</button>
                      <button type="button" onClick={() => setApplyingId("")}>Cancel</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <form className="finance-form" onSubmit={save}>
          <span className="panel-kicker">New entry</span>
          <h2>Record advance</h2>
          <label><span>Advance type</span><select value={advanceType} onChange={(event) => changeType(event.target.value as AdvanceView["advanceType"])}><option value="customer_received">Customer advance received</option><option value="supplier_paid">Supplier advance paid</option><option value="employee_paid">Employee salary advance</option></select></label>
          <label><span>Select {expectedKind}</span><select value={partyId} onChange={(event) => chooseParty(event.target.value)}><option value="">Manual entry</option>{availableParties.map((party) => <option value={party.id} key={party.id}>{party.name}</option>)}</select></label>
          <label><span>{expectedKind[0].toUpperCase() + expectedKind.slice(1)} name</span><input value={partyName} onChange={(event) => setPartyName(event.target.value)} required /></label>
          <div className="finance-form-grid"><label><span>Date</span><input type="date" value={advanceDate} onChange={(event) => setAdvanceDate(event.target.value)} required /></label><label><span>Amount ₹</span><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label></div>
          <div className="finance-form-grid"><label><span>Already applied ₹</span><input type="number" min="0" step="0.01" value={appliedAmount} onChange={(event) => setAppliedAmount(event.target.value)} /></label><label><span>Payment mode</span><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label></div>
          <label><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR, cheque or receipt number" /></label>
          <label><span>Purpose</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What is this advance for?" /></label>
          <label><span>Notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className={`form-status ${status}`} role="status">{message}</div>
          <button className="dashboard-primary finance-save" disabled={status === "saving"}><Save />{status === "saving" ? "Saving…" : "Save advance"}</button>
        </form>
      </div>
    </>
  );
}
