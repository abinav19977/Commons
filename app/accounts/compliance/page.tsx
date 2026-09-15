import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { businessProfiles, complianceConnections } from "../../../db/schema";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { CheckCircle2, FileCheck2, Link2, ReceiptIndianRupee, Truck } from "lucide-react";

export const dynamic = "force-dynamic";
export default async function CompliancePage() {
  const user = await requireChatGPTUser("/accounts/compliance");
  let profile: { gstin: string | null } | null = null;
  let connection: { gstStatus: string; einvoiceStatus: string; ewayBillStatus: string } | null = null;
  try {
    const [profiles, connections] = await Promise.all([
      getDb().select({ gstin: businessProfiles.gstin }).from(businessProfiles).where(eq(businessProfiles.ownerUserId, user.id)).limit(1),
      getDb().select({ gstStatus: complianceConnections.gstStatus, einvoiceStatus: complianceConnections.einvoiceStatus, ewayBillStatus: complianceConnections.ewayBillStatus }).from(complianceConnections).where(eq(complianceConnections.ownerUserId, user.id)).limit(1),
    ]);
    profile = profiles[0] || null;
    connection = connections[0] || null;
  } catch (error) { console.error("Compliance status unavailable", error); }
  const gstin = profile?.gstin || "";
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface">
    <a className="back-link" href="/accounts">← Commons Books</a>
    <div className="surface-heading"><span>GST connections</span><h1>Prepare here. File with confidence.</h1><p>Commons calculates and validates your records. Portal submission stays blocked until authorised provider credentials and accountant approval are present.</p></div>
    <div className="compliance-readiness"><span className={gstin ? "ready" : "pending"}>{gstin ? <CheckCircle2 /> : <Link2 />}<b>{gstin ? "GSTIN available in profile" : "Add GSTIN to continue"}</b></span><span className="pending"><FileCheck2 /><b>Accountant approval required</b></span></div>
    <div className="compliance-grid">
      <article><div><ReceiptIndianRupee /><span>{connection?.gstStatus === "connected" ? "Connected" : "Ready to review"}</span></div><h2>GSTR-1 & GSTR-3B</h2><p>Compare sales tax, eligible purchase credit, notes and exceptions before filing.</p><a href="/gst">Open GST review →</a></article>
      <article><div><FileCheck2 /><span>{connection?.einvoiceStatus === "connected" ? "Connected" : "Credentials needed"}</span></div><h2>E-invoice</h2><p>Validate GSTIN, document number, HSN, place of supply and tax totals before sending to an authorised IRP.</p><a href="/transactions/new">Prepare an invoice →</a></article>
      <article><div><Truck /><span>{connection?.ewayBillStatus === "connected" ? "Connected" : "Credentials needed"}</span></div><h2>E-way bill</h2><p>Prepare transporter, vehicle, distance and invoice data. Submission requires an authorised provider connection.</p><a href="/other/business">Check business details →</a></article>
    </div>
    <section className="compliance-checklist"><h2>Before filing</h2><div><span>01</span><p><b>Reconcile sales</b>Check invoice numbers, GSTINs, credit notes and place of supply.</p></div><div><span>02</span><p><b>Match purchase credit</b>Compare books with GSTR-2B and remove ineligible credit.</p></div><div><span>03</span><p><b>Approve and lock</b>Have an accountant approve the period, then lock it after filing.</p></div></section>
    <p className="professional-note">Commons does not claim or maximise artificial refunds. It identifies lawful credits and exceptions; the taxpayer and authorised professional remain responsible for filing.</p>
  </section><CommonsAssistant context="gst" /></main>;
}
