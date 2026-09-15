"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useState } from "react";
import { BrainCircuit, ExternalLink, ShieldCheck } from "lucide-react";

type Check = { level: string; title: string; detail: string };
type FilingResult = {
  outputTaxPaise: number;
  outputCessPaise: number;
  booksInputGstPaise: number;
  estimatedNetPaise: number;
  potentialCarryForwardPaise: number;
  invoiceCount: number;
  purchaseCount: number;
  checks: Check[];
  mode: "llm" | "analytical";
  brief: string;
};
export type FilingHistory = {
  id: string;
  periodStart: string;
  periodEnd: string;
  returnType: string;
  estimatedNetPaise: number;
  issueCount: number;
  analysisMode: string;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${period}-01`, end };
}

export default function GstWorkspace({ history }: { history: FilingHistory[] }) {
  const [period, setPeriod] = useState(currentMonth());
  const [returnType, setReturnType] = useState("Combined");
  const [status, setStatus] = useState<"idle" | "analysing" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<FilingResult | null>(null);

  async function analyse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("analysing");
    setMessage("");
    const range = monthRange(period);
    try {
      const response = await companyFetch("/api/gst/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: range.start,
          periodEnd: range.end,
          returnType,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as FilingResult & { message?: string };
      if (!response.ok) throw new Error(data.message || "Could not analyse this filing period.");
      setResult(data);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not analyse this filing period.");
    }
  }

  return (
    <div className="gst-layout">
      <section className="gst-workbench">
        <form className="gst-controls" onSubmit={analyse}>
          <label>
            <span>Tax period</span>
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
          </label>
          <label>
            <span>Return review</span>
            <select value={returnType} onChange={(event) => setReturnType(event.target.value)}>
              <option value="Combined">GSTR-1 + GSTR-3B</option>
              <option value="GSTR-1">GSTR-1</option>
              <option value="GSTR-3B">GSTR-3B</option>
            </select>
          </label>
          <button className="dashboard-primary" disabled={status === "analysing"}>
            <BrainCircuit /> {status === "analysing" ? "Analysing…" : "Analyse filing"}
          </button>
        </form>
        <div className={`form-status ${status}`} role="status">{message}</div>

        {result ? (
          <div className="gst-result">
            <div className="gst-result-header">
              <div><BrainCircuit /><span>GST Filing Intelligence</span></div>
              <small>{result.mode === "llm" ? "Dedicated LLM review" : "Analytical fallback"}</small>
            </div>
            <p className="gst-brief">{result.brief}</p>
            <div className="gst-metrics">
              <div><span>Output GST</span><strong>{money(result.outputTaxPaise)}</strong><small>{result.invoiceCount} invoices · cess {money(result.outputCessPaise)}</small></div>
              <div><span>Input GST in books</span><strong>{money(result.booksInputGstPaise)}</strong><small>{result.purchaseCount} purchases</small></div>
              <div><span>Estimated cash exposure</span><strong>{money(result.estimatedNetPaise)}</strong><small>Before cess and statutory adjustments</small></div>
              <div><span>Potential carry-forward</span><strong>{money(result.potentialCarryForwardPaise)}</strong><small>Subject to ITC eligibility</small></div>
            </div>
            <div className="gst-checks">
              {result.checks.map((check) => (
                <article className={check.level} key={check.title}>
                  <span>{check.level}</span>
                  <strong>{check.title}</strong>
                  <p>{check.detail}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="gst-empty">
            <ShieldCheck />
            <strong>Choose a period to create a filing review.</strong>
            <p>Commons will compare recorded outward tax with purchase GST and flag records that need reconciliation.</p>
          </div>
        )}

        <div className="gst-disclaimer">
          <strong>Important</strong>
          <p>“Input GST in books” is not automatically eligible ITC. Reconcile it with GSTR-2B and applicable rules, then obtain approval from your CA or GST practitioner before filing.</p>
        </div>
      </section>

      <aside className="gst-side">
        <section>
          <span className="panel-kicker">Official resources</span>
          <h2>Verify before filing</h2>
          <a href="https://tutorial.gst.gov.in/userguide/returns/FAQ_gstr2b.htm" target="_blank" rel="noreferrer">GSTR-2B guidance <ExternalLink /></a>
          <a href="https://tutorial.gst.gov.in/userguide/returns/GSTR3B.htm" target="_blank" rel="noreferrer">GSTR-3B guidance <ExternalLink /></a>
          <a href="https://tutorial.gst.gov.in/userguide/returns/GSTR_1.htm" target="_blank" rel="noreferrer">GSTR-1 guidance <ExternalLink /></a>
        </section>
        <section>
          <span className="panel-kicker">Recent reviews</span>
          <h2>Filing sessions</h2>
          {history.length ? history.map((item) => (
            <div className="gst-history-row" key={item.id}>
              <span><strong>{item.periodStart.slice(0, 7)}</strong><small>{item.returnType} · {item.analysisMode}</small></span>
              <span><strong>{money(item.estimatedNetPaise)}</strong><small>{item.issueCount} review flags</small></span>
            </div>
          )) : <p className="form-help">No saved filing reviews yet.</p>}
        </section>
      </aside>
    </div>
  );
}
