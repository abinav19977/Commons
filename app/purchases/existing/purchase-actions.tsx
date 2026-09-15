"use client";
import { companyFetch } from "@/app/company-fetch";

import { useState } from "react";
import { CheckCircle2, RotateCw } from "lucide-react";

export default function PurchaseActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function receive() {
    if (!window.confirm("Confirm that every item in this order has been received? This will update stock and accounts.")) return;
    setBusy(true); setMessage("");
    const response = await companyFetch(`/api/purchases/${encodeURIComponent(id)}/receive`, { method: "POST" });
    const body = await response.json().catch(() => ({})) as { message?: string };
    setBusy(false);
    if (!response.ok) { setMessage(body.message || "Could not receive purchase."); return; }
    window.location.reload();
  }
  return <div className="purchase-row-actions">
    {status === "ordered" && <button type="button" onClick={receive} disabled={busy}><CheckCircle2 />{busy ? "Receiving…" : "Receive"}</button>}
    <a href={`/purchases/new?repeat=${encodeURIComponent(id)}`}><RotateCw />Repeat</a>
    {message && <small>{message}</small>}
  </div>;
}
