import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";

const schema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnType: z.enum(["GSTR-1", "GSTR-3B", "Combined"]),
});

type FilingMetrics = {
  outputTaxPaise: number;
  outputCessPaise: number;
  booksInputGstPaise: number;
  estimatedNetPaise: number;
  potentialCarryForwardPaise: number;
  invoiceCount: number;
  purchaseCount: number;
  invoicesWithoutGstin: number;
  purchasesWithoutGstin: number;
  matched2bCount: number;
  unmatched2bCount: number;
  booksOnlyCount: number;
  ineligibleItcPaise: number;
  reverseChargePaise: number;
};

function fallbackBrief(metrics: FilingMetrics) {
  if (!metrics.invoiceCount && !metrics.purchaseCount)
    return "No transactions were found for this period. Confirm the dates and import any missing sales or purchase records before preparing a return.";
  const exposure = metrics.estimatedNetPaise > 0
    ? `The books indicate a possible net GST cash exposure of ₹${(metrics.estimatedNetPaise / 100).toLocaleString("en-IN")}.`
    : "Recorded input GST is at least equal to output GST, subject to eligibility and GSTR-2B reconciliation.";
  return `${exposure} Reconcile every purchase document with GSTR-2B, review invoice classifications and obtain professional approval before filing.`;
}

function extractResponseText(data: unknown) {
  const response = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return (
    response.output_text ||
    response.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("\n") ||
    ""
  ).trim();
}

async function generateGstBrief(metrics: FilingMetrics, periodStart: string, periodEnd: string) {
  const fallback = fallbackBrief(metrics);
  const key = (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  if (!key) return { mode: "analytical" as const, brief: fallback };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: `Act as a conservative Indian GST filing review assistant. Analyse only the supplied books metrics for ${periodStart} to ${periodEnd}. Output a concise filing brief of at most 120 words. Optimise lawful compliance and potential eligible input tax credit, but never state that books GST is eligible ITC until reconciled with GSTR-2B. Do not invent due dates, exemptions, refunds, reverse-charge values or legal conclusions. Always advise verification on the GST portal and approval by a qualified tax professional. Metrics: ${JSON.stringify(metrics)}`,
        max_output_tokens: 220,
      }),
    });
    if (!response.ok) return { mode: "analytical" as const, brief: fallback };
    const brief = extractResponseText(await response.json());
    return { mode: "llm" as const, brief: brief || fallback };
  } catch {
    return { mode: "analytical" as const, brief: fallback };
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Select a valid filing period." }, { status: 400 });
  const { periodStart, periodEnd, returnType } = parsed.data;
  const start = Date.parse(`${periodStart}T00:00:00Z`);
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 370 * 86400000)
    return NextResponse.json({ message: "The filing period must be 370 days or less." }, { status: 400 });

  const raw = getRawDb();
  try {
    const taxPeriod = periodStart.slice(0, 7);
    const results = await raw.batch([
      raw
        .prepare(
          "SELECT COUNT(*) AS invoice_count,COALESCE(SUM(cgst_paise + sgst_paise + igst_paise),0) AS output_tax,COALESCE(SUM(cess_paise),0) AS output_cess,COALESCE(SUM(CASE WHEN customer_gstin IS NULL OR customer_gstin = '' THEN 1 ELSE 0 END),0) AS without_gstin FROM invoices WHERE owner_user_id = ? AND invoice_date BETWEEN ? AND ? AND status != 'cancelled'",
        )
        .bind(user.id, periodStart, periodEnd),
      raw
        .prepare(
          "SELECT COUNT(*) AS purchase_count,COALESCE(SUM(CASE WHEN itc_eligible=1 THEN gst_paise ELSE 0 END),0) AS books_input_gst,COALESCE(SUM(CASE WHEN itc_eligible=0 THEN gst_paise ELSE 0 END),0) AS ineligible_itc,COALESCE(SUM(CASE WHEN reverse_charge=1 THEN gst_paise ELSE 0 END),0) AS reverse_charge,COALESCE(SUM(CASE WHEN supplier_gstin IS NULL OR supplier_gstin = '' THEN 1 ELSE 0 END),0) AS without_gstin FROM purchases WHERE owner_user_id = ? AND purchase_date BETWEEN ? AND ? AND status IN ('received','part_paid','paid')",
        )
        .bind(user.id, periodStart, periodEnd),
      raw.prepare("SELECT COALESCE(SUM(CASE WHEN match_status='matched' THEN 1 ELSE 0 END),0) matched,COALESCE(SUM(CASE WHEN match_status!='matched' THEN 1 ELSE 0 END),0) unmatched FROM gst_2b_entries WHERE owner_user_id=? AND tax_period=?").bind(user.id,taxPeriod),
      raw.prepare("SELECT COUNT(*) books_only FROM purchases p WHERE p.owner_user_id=? AND p.purchase_date BETWEEN ? AND ? AND p.status IN ('received','part_paid','paid') AND p.itc_eligible=1 AND p.supplier_gstin IS NOT NULL AND p.supplier_invoice_number IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gst_2b_entries g WHERE g.owner_user_id=p.owner_user_id AND g.tax_period=? AND g.matched_purchase_id=p.id)").bind(user.id,periodStart,periodEnd,taxPeriod),
      raw.prepare("SELECT COALESCE(SUM(gst_paise),0) tax FROM adjustment_documents WHERE owner_user_id=? AND document_date BETWEEN ? AND ? AND status='posted' AND document_type IN ('sales_return','credit_note')").bind(user.id,periodStart,periodEnd),
      raw.prepare("SELECT COALESCE(SUM(gst_paise),0) tax FROM adjustment_documents WHERE owner_user_id=? AND document_date BETWEEN ? AND ? AND status='posted' AND document_type IN ('purchase_return','debit_note')").bind(user.id,periodStart,periodEnd),
    ]);
    const sales = (results[0].results?.[0] || {}) as Record<string, unknown>;
    const purchases = (results[1].results?.[0] || {}) as Record<string, unknown>;
    const reconciliation = (results[2].results?.[0] || {}) as Record<string,unknown>;
    const booksOnly = (results[3].results?.[0] || {}) as Record<string,unknown>;
    const salesAdjustments = (results[4].results?.[0] || {}) as Record<string,unknown>;
    const purchaseAdjustments = (results[5].results?.[0] || {}) as Record<string,unknown>;
    const reverseChargePaise = Number(purchases.reverse_charge || 0);
    const outputTaxPaise = Math.max(0, Number(sales.output_tax || 0) - Number(salesAdjustments.tax || 0) + reverseChargePaise);
    const booksInputGstPaise = Math.max(0, Number(purchases.books_input_gst || 0) - Number(purchaseAdjustments.tax || 0));
    const metrics: FilingMetrics = {
      outputTaxPaise,
      outputCessPaise: Number(sales.output_cess || 0),
      booksInputGstPaise,
      estimatedNetPaise: Math.max(0, outputTaxPaise - booksInputGstPaise),
      potentialCarryForwardPaise: Math.max(0, booksInputGstPaise - outputTaxPaise),
      invoiceCount: Number(sales.invoice_count || 0),
      purchaseCount: Number(purchases.purchase_count || 0),
      invoicesWithoutGstin: Number(sales.without_gstin || 0),
      purchasesWithoutGstin: Number(purchases.without_gstin || 0),
      matched2bCount: Number(reconciliation.matched || 0),
      unmatched2bCount: Number(reconciliation.unmatched || 0),
      booksOnlyCount: Number(booksOnly.books_only || 0),
      ineligibleItcPaise: Number(purchases.ineligible_itc || 0),
      reverseChargePaise,
    };
    const checks = [
      {
        level: metrics.unmatched2bCount || metrics.booksOnlyCount || metrics.purchasesWithoutGstin ? "attention" : metrics.matched2bCount ? "ready" : "review",
        title: "GSTR-2B reconciliation",
        detail: metrics.matched2bCount || metrics.unmatched2bCount
          ? `${metrics.matched2bCount} matched; ${metrics.unmatched2bCount} portal item(s) and ${metrics.booksOnlyCount} book item(s) need review.`
          : "Upload the GSTR-2B CSV for this month before claiming input tax credit.",
      },
      {
        level: metrics.invoicesWithoutGstin ? "review" : "ready",
        title: "Outward supply classification",
        detail: metrics.invoicesWithoutGstin
          ? `${metrics.invoicesWithoutGstin} sales invoice(s) have no customer GSTIN. Confirm that their B2C or unregistered classification is correct for GSTR-1.`
          : "Recorded sales invoices contain customer GSTINs. Confirm B2B, place-of-supply and tax-rate classification.",
      },
      {
        level: metrics.ineligibleItcPaise || metrics.reverseChargePaise ? "attention" : "review",
        title: "Eligibility and reverse charge",
        detail: `${moneyText(metrics.ineligibleItcPaise)} is marked ineligible and excluded from ITC. ${moneyText(metrics.reverseChargePaise)} is marked reverse charge. Verify statutory eligibility and payment on the GST portal.`,
      },
    ];
    const ai = await generateGstBrief(metrics, periodStart, periodEnd);
    const id = crypto.randomUUID();
    await raw
      .prepare(
        "INSERT INTO gst_filing_sessions (id,owner_user_id,period_start,period_end,return_type,output_tax_paise,output_cess_paise,books_input_gst_paise,estimated_net_paise,potential_carry_forward_paise,invoice_count,purchase_count,matched_2b_count,unmatched_2b_count,books_only_count,ineligible_itc_paise,issue_count,analysis_mode,advice,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.id,
        periodStart,
        periodEnd,
        returnType,
        metrics.outputTaxPaise,
        metrics.outputCessPaise,
        metrics.booksInputGstPaise,
        metrics.estimatedNetPaise,
        metrics.potentialCarryForwardPaise,
        metrics.invoiceCount,
        metrics.purchaseCount,
        metrics.matched2bCount,
        metrics.unmatched2bCount,
        metrics.booksOnlyCount,
        metrics.ineligibleItcPaise,
        checks.filter((item) => item.level !== "ready").length,
        ai.mode,
        ai.brief,
        "draft",
        Date.now(),
      )
      .run();
    return NextResponse.json({ id, ...metrics, checks, ...ai });
  } catch (error) {
    console.error("GST filing analysis failed", error);
    return NextResponse.json({ message: "The filing analysis could not be completed." }, { status: 500 });
  }
}

function moneyText(paise:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(paise/100)}
