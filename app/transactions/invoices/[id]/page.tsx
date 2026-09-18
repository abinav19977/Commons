import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "../../../../db";
import {
  businessProfiles,
  invoiceItems,
  invoices,
} from "../../../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../../company-auth";
import CommonsAssistant from "../../../components/commons-assistant";
import {
  demoInvoiceItemsById,
  demoInvoices,
  type InvoiceItemView,
  type InvoiceView,
} from "../../invoice-data";
import PrintButton from "../../print-button";
import { demoBusinessProfile } from "../../../other/business/demo-profile";
export const dynamic = "force-dynamic";
function CommonsMark() {
  return (
    <svg
      className="brand-mark brand-mark-small"
      aria-hidden="true"
      viewBox="0 0 128 128"
      fill="none"
    >
      <path
        d="M99 34A47 47 0 1 0 99 94"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="square"
      />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}
const money = (p: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(p / 100);
type BusinessProfileView = {
  legalName:string;tradeName:string|null;gstin:string|null;pan:string|null;phone:string|null;email:string|null;
  addressLine1:string|null;addressLine2:string|null;city:string|null;state:string|null;pinCode:string|null;
  bankName:string|null;accountName:string|null;accountNumber:string|null;ifsc:string|null;terms:string|null;
};
async function Invoice({ id }: { id: string }) {
  const user = await requireChatGPTUser(
    "/transactions/invoices/" + encodeURIComponent(id),
  );
  let invoice: InvoiceView | null =
    demoInvoices.find((item) => item.id === id) || null;
  let items: InvoiceItemView[] = demoInvoiceItemsById[id] || [];
  let profile: BusinessProfileView | null = invoice
    ? {
        legalName: "Commons Supply Co.",
        tradeName: "Commons Supply",
        gstin: "29ABCDE1234F1Z5",
        pan: "ABCDE1234F",
        phone: "9876543210",
        email: "billing@commons.example",
        addressLine1: "12 MG Road",
        addressLine2: "Central Business District",
        city: "Bengaluru",
        state: "Karnataka",
        pinCode: "560001",
        bankName: "State Bank of India",
        accountName: "Commons Supply Co.",
        accountNumber: "XXXXXX4821",
        ifsc: "SBIN0001234",
        terms: "Payment due within 30 days.",
      }
    : null;
  if (!invoice) {
    const [rows, itemRows, profiles] = await Promise.all([
      getDb()
        .select()
        .from(invoices)
        .where(and(eq(invoices.ownerUserId, user.id), eq(invoices.id, id)))
        .limit(1),
      getDb()
        .select()
        .from(invoiceItems)
        .where(
          and(
            eq(invoiceItems.ownerUserId, user.id),
            eq(invoiceItems.invoiceId, id),
          ),
        )
        .orderBy(asc(invoiceItems.position)),
      getDb()
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.ownerUserId, user.id))
        .limit(1),
    ]);
    const row = rows[0];
    if (row)
      invoice = {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        dueDate: row.dueDate,
        customerName: row.customerName,
        customerGstin: row.customerGstin,
        customerAddress: row.customerAddress,
        placeOfSupply: row.placeOfSupply,
        supplyType: row.supplyType,
        sellerLegalName: row.sellerLegalName,
        sellerTradeName: row.sellerTradeName,
        sellerGstin: row.sellerGstin,
        sellerPan: row.sellerPan,
        sellerAddress: row.sellerAddress,
        subtotalPaise: row.subtotalPaise,
        discountPaise: row.discountPaise,
        cgstPaise: row.cgstPaise,
        sgstPaise: row.sgstPaise,
        igstPaise: row.igstPaise,
        cessPaise: row.cessPaise,
        totalPaise: row.totalPaise,
        paidPaise: row.paidPaise,
        status: row.status,
        notes: row.notes,
      };
    items = itemRows.map((r) => ({
      id: r.id,
      description: r.description,
      hsnSac: r.hsnSac,
      quantityMilli: r.quantityMilli,
      unit: r.unit,
      ratePaise: r.ratePaise,
      gstRateBasisPoints: r.gstRateBasisPoints,
      taxablePaise: r.taxablePaise,
      taxPaise: r.taxPaise,
      totalPaise: r.totalPaise,
      position: r.position,
    }));
    profile = profiles[0] || demoBusinessProfile;
  }
  if (!invoice) notFound();
  if (!profile)
    return (
      <div className="record-unavailable">
        Business profile is unavailable for this invoice.
      </div>
    );
  // Prefer the seller identity snapshotted onto the invoice at issue time, so a later
  // change to the business profile (GSTIN, address, name) never rewrites what an
  // already-issued invoice displays. Older invoices predate the snapshot and fall
  // back to today's live profile, same as before this fix.
  const sellerLegalName = invoice.sellerLegalName || profile.legalName;
  const sellerTradeName = invoice.sellerTradeName || profile.tradeName;
  const sellerGstin = invoice.sellerGstin || profile.gstin;
  const sellerPan = invoice.sellerPan || profile.pan;
  const sellerAddress =
    invoice.sellerAddress ||
    [profile.addressLine1, profile.addressLine2, profile.city, profile.state, profile.pinCode]
      .filter(Boolean)
      .join(", ");
  return (
    <>
      <div className="invoice-actions no-print">
        <a className="back-link" href="/transactions/existing">
          ← Transactions
        </a>
        <PrintButton />
      </div>
      <article className="print-invoice">
        <header className="invoice-header">
          <div>
            <span className="invoice-kicker">Tax invoice</span>
            <h1>{sellerTradeName || sellerLegalName}</h1>
            <p>{sellerAddress}</p>
            <p>
              GSTIN: {sellerGstin || "—"} · PAN: {sellerPan || "—"}
            </p>
          </div>
          <div className="invoice-number">
            <span>Invoice number</span>
            <strong>{invoice.invoiceNumber}</strong>
            <span>Date</span>
            <strong>{invoice.invoiceDate}</strong>
            <span>Due date</span>
            <strong>{invoice.dueDate || "—"}</strong>
          </div>
        </header>
        <section className="invoice-parties">
          <div>
            <span>Bill to</span>
            <strong>{invoice.customerName}</strong>
            <p>{invoice.customerAddress || "Address not added"}</p>
            <p>GSTIN: {invoice.customerGstin || "Unregistered"}</p>
          </div>
          <div>
            <span>Place of supply</span>
            <strong>{invoice.placeOfSupply || "—"}</strong>
            <p>
              {invoice.supplyType === "intra_state"
                ? "Intra-state supply"
                : "Inter-state supply"}
            </p>
          </div>
        </section>
        <div className="transaction-table-wrap">
          <table className="invoice-item-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN/SAC</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>GST</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id}>
                  <td>{i + 1}</td>
                  <td>{item.description}</td>
                  <td>{item.hsnSac || "—"}</td>
                  <td>
                    {item.quantityMilli / 1000} {item.unit}
                  </td>
                  <td>{money(item.ratePaise)}</td>
                  <td>{item.gstRateBasisPoints / 100}%</td>
                  <td>{money(item.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="invoice-summary">
          <div>
            <span>Notes</span>
            <p>{invoice.notes || "—"}</p>
          </div>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(invoice.subtotalPaise)}</dd>
            </div>
            {invoice.discountPaise > 0 && (
              <div>
                <dt>Discount</dt>
                <dd>− {money(invoice.discountPaise)}</dd>
              </div>
            )}
            {invoice.cgstPaise > 0 && (
              <div>
                <dt>CGST</dt>
                <dd>{money(invoice.cgstPaise)}</dd>
              </div>
            )}
            {invoice.sgstPaise > 0 && (
              <div>
                <dt>SGST</dt>
                <dd>{money(invoice.sgstPaise)}</dd>
              </div>
            )}
            {invoice.igstPaise > 0 && (
              <div>
                <dt>IGST</dt>
                <dd>{money(invoice.igstPaise)}</dd>
              </div>
            )}
            {invoice.cessPaise > 0 && (
              <div>
                <dt>Cess</dt>
                <dd>{money(invoice.cessPaise)}</dd>
              </div>
            )}
            <div className="grand-total">
              <dt>Total</dt>
              <dd>{money(invoice.totalPaise)}</dd>
            </div>
          </dl>
        </section>
        <footer className="invoice-footer">
          <div>
            <strong>Bank details</strong>
            <p>
              {profile.bankName || "—"} · {profile.accountNumber || "—"} ·{" "}
              {profile.ifsc || "—"}
            </p>
          </div>
          <div>
            <strong>Terms</strong>
            <p>{profile.terms || "Payment due as agreed."}</p>
          </div>
        </footer>
      </article>
    </>
  );
}
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="invoice-page">
      <header className="site-header workspace-header no-print">
        <a className="wordmark" href="/transactions">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <Invoice id={id} />
      <CommonsAssistant context="billing" />
    </main>
  );
}
