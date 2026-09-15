import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { customers, invoices } from "../../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { type InvoiceView } from "../invoice-data";
import ListToolbar from "../../components/list-toolbar";
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
    maximumFractionDigits: 0,
  }).format(p / 100);
export default async function TransactionsListPage() {
  const user = await requireChatGPTUser("/transactions/existing");
  let saved: InvoiceView[] = [];
  let unavailable = false;
  try {
    saved = (
      await getDb()
        .select({ invoice: invoices, nickname: customers.nickname })
        .from(invoices)
        .leftJoin(
          customers,
          and(
            eq(customers.id, invoices.customerId),
            eq(customers.ownerUserId, user.id),
          ),
        )
        .where(eq(invoices.ownerUserId, user.id))
        .orderBy(desc(invoices.invoiceDate))
    ).map(({ invoice: row, nickname }) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate,
      customerName: nickname || row.customerName,
      customerGstin: row.customerGstin,
      customerAddress: row.customerAddress,
      placeOfSupply: row.placeOfSupply,
      supplyType: row.supplyType,
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
    }));
  } catch (error) {
    console.error("Invoice list unavailable", error);
    unavailable = true;
  }
  const list = saved;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/transactions">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-directory">
        <a className="back-link" href="/transactions">
          ← Transactions
        </a>
        <div className="directory-heading">
          <h1>Transactions</h1>
          <span>{list.length.toString().padStart(2, "0")}</span>
        </div>
        {unavailable && (
          <p className="directory-notice">
            Saved transactions are temporarily unavailable.
          </p>
        )}
        <ListToolbar filters={[{label:"Paid",value:"paid"},{label:"Part paid",value:"part paid"},{label:"Unpaid",value:"unpaid"}]}/>
        <div className="customer-list">
          {list.map((invoice, index) => (
            <a
              className="customer-row invoice-row"
              href={"/transactions/invoices/" + invoice.id}
              key={invoice.id}
            >
              <span className="customer-index">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span className="customer-identity">
                <strong>{invoice.customerName}</strong>
                <small>{invoice.invoiceNumber}</small>
              </span>
              <span className="invoice-date">{invoice.invoiceDate}</span>
              <span className="invoice-status">{invoice.status}</span>
              <strong className="invoice-amount">
                {money(invoice.totalPaise)}
              </strong>
              <span className="customer-arrow">↗</span>
            </a>
          ))}
        </div>
      </section>
      <CommonsAssistant context="billing" />
    </main>
  );
}
