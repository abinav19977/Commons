import { notFound } from "next/navigation";
import { getRawDb } from "../../../db";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import {
  demoCustomers,
  demoTransactionsByCustomer,
  type CustomerTransaction,
  type CustomerView,
} from "../customer-data";
import { findCustomer } from "../customer-store";
import CommonsAssistant from "../../components/commons-assistant";
import CustomerIdentitySettings from "./customer-identity-settings";

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

function rupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function address(customer: CustomerView) {
  return (
    [
      customer.billingAddressLine1,
      customer.billingAddressLine2,
      customer.billingCity,
      customer.billingState,
      customer.billingPinCode,
    ]
      .filter(Boolean)
      .join(", ") || "Not added"
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function TransactionTable({
  transactions,
}: {
  transactions: CustomerTransaction[];
}) {
  if (!transactions.length)
    return <div className="empty-transactions">No transactions yet.</div>;

  return (
    <div className="transaction-table-wrap">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Reference</th>
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.reference}>
              <td>{transaction.date}</td>
              <td>{transaction.type}</td>
              <td>{transaction.reference}</td>
              <td>{transaction.status}</td>
              <td>{rupees(transaction.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function CustomerDetail({ id }: { id: string }) {
  const user = await requireChatGPTUser(`/customers/${encodeURIComponent(id)}`);
  let customer: CustomerView | null =
    demoCustomers.find((item) => item.id === id) || null;
  const isDemo = Boolean(customer);
  let unavailable = false;
  let transactions: CustomerTransaction[] = demoTransactionsByCustomer[id] || [];
  let ledgerReceivablePaise: number | null = null;

  if (!customer) {
    try {
      customer = await findCustomer(user.id, id);
      if (customer) {
        const raw = getRawDb();
        const [invoiceRows, paymentRows, ledgerRow] = await Promise.all([
          raw
            .prepare(
              "SELECT invoice_date,invoice_number,total_paise,status FROM invoices WHERE owner_user_id = ? AND customer_id = ? ORDER BY invoice_date DESC",
            )
            .bind(user.id, id)
            .all<Record<string, unknown>>(),
          raw
            .prepare(
              "SELECT transaction_date,COALESCE(reference,'BANK') AS reference,amount_paise FROM bank_transactions WHERE owner_user_id = ? AND matched_entity_type = 'invoice' AND matched_entity_id IN (SELECT id FROM invoices WHERE owner_user_id = ? AND customer_id = ?) ORDER BY transaction_date DESC",
            )
            .bind(user.id, user.id, id)
            .all<Record<string, unknown>>(),
          raw
            .prepare(
              "SELECT COALESCE(SUM(jl.debit_paise - jl.credit_paise),0) AS net FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE jl.owner_user_id = ? AND jl.party_id = ? AND jl.account_code = '1100' AND je.status = 'posted'",
            )
            .bind(user.id, id)
            .first<{ net: number }>(),
        ]);
        ledgerReceivablePaise = ledgerRow?.net ?? 0;
        transactions = [
          ...(invoiceRows.results || []).map((row) => ({
            date: String(row.invoice_date),
            type: "Invoice" as const,
            reference: String(row.invoice_number),
            amountPaise: Number(row.total_paise || 0),
            status: row.status === "paid" ? ("Paid" as const) : ("Due" as const),
          })),
          ...(paymentRows.results || []).map((row) => ({
            date: String(row.transaction_date),
            type: "Payment" as const,
            reference: String(row.reference),
            amountPaise: Number(row.amount_paise || 0),
            status: "Received" as const,
          })),
        ].sort((a, b) => b.date.localeCompare(a.date));
      }
    } catch (error) {
      console.error("Customer detail unavailable", error);
      unavailable = true;
    }
  }

  if (unavailable)
    return (
      <div className="record-unavailable">
        Customer details are temporarily unavailable. Please try again.
      </div>
    );
  if (!customer) notFound();

  const invoiced = transactions
    .filter((item) => item.type === "Invoice")
    .reduce((sum, item) => sum + item.amountPaise, 0);
  const received = transactions
    .filter((item) => item.type === "Payment")
    .reduce((sum, item) => sum + item.amountPaise, 0);
  // Prefer the ledger's own receivable balance (it reflects credit notes, write-offs
  // and manual corrections, not just invoices matched to bank transactions). Demo
  // customers have no ledger postings, so they fall back to the invoice-based estimate.
  const outstanding = Math.max(
    0,
    customer.openingBalancePaise + (ledgerReceivablePaise ?? invoiced - received),
  );

  return (
    <>
      <div className="customer-profile-heading">
        <span>
          {customer.customerType === "business"
            ? "Business customer"
            : "Individual customer"}
          {customer.nickname ? ` · ${customer.displayName}` : ""}
        </span>
        <h1>{customer.nickname || customer.displayName}</h1>
        <div className="profile-links">
          <a href="#summary">Summary</a>
          <a href="#transactions">Transactions</a>
        </div>
      </div>

      {!isDemo && (
        <CustomerIdentitySettings
          id={customer.id}
          initialNickname={customer.nickname || ""}
          initialBankAccountLast4={customer.bankAccountLast4 || ""}
        />
      )}

      <section
        id="summary"
        className="profile-section"
        aria-labelledby="summary-title"
      >
        <h2 id="summary-title">Summary</h2>
        <div className="summary-grid">
          <div>
            <span>Outstanding</span>
            <strong>{rupees(outstanding)}</strong>
          </div>
          <div>
            <span>Total invoiced</span>
            <strong>{rupees(invoiced)}</strong>
          </div>
          <div>
            <span>Credit limit</span>
            <strong>{rupees(customer.creditLimitPaise)}</strong>
          </div>
          <div>
            <span>Credit period</span>
            <strong>{customer.creditDays} days</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <Detail label="Contact person" value={customer.contactName} />
          <Detail label="Legal / billing name" value={customer.displayName} />
          <Detail label="Nickname" value={customer.nickname} />
          <Detail
            label="Primary phone"
            value={`+91 ${customer.primaryPhone}`}
          />
          <Detail
            label="Secondary phone"
            value={
              customer.secondaryPhone ? `+91 ${customer.secondaryPhone}` : null
            }
          />
          <Detail label="Email" value={customer.email} />
          <Detail label="GSTIN" value={customer.gstin} />
          <Detail label="PAN" value={customer.pan} />
          <Detail
            label="Bank account identifier"
            value={customer.bankAccountLast4 ? `•••• ${customer.bankAccountLast4}` : null}
          />
          <Detail
            label="GST registration"
            value={customer.gstRegistrationType}
          />
          <Detail label="Place of supply" value={customer.placeOfSupply} />
          <Detail label="Billing address" value={address(customer)} />
          <Detail label="Notes" value={customer.notes} />
        </dl>
      </section>

      <section
        id="transactions"
        className="profile-section"
        aria-labelledby="transactions-title"
      >
        <div className="section-heading">
          <h2 id="transactions-title">Transactions</h2>
          <span>{transactions.length.toString().padStart(2, "0")}</span>
        </div>
        <TransactionTable transactions={transactions} />
      </section>
    </>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/customers/existing"
          aria-label="Back to customer list"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-profile">
        <a className="back-link" href="/customers/existing">
          ← Existing customers
        </a>
        <CustomerDetail id={id} />
      </section>
      <CommonsAssistant context="customers" />
    </main>
  );
}
