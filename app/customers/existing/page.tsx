import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import { type CustomerView } from "../customer-data";
import { listCustomers } from "../customer-store";
import CommonsAssistant from "../../components/commons-assistant";
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

function location(customer: CustomerView) {
  return (
    [customer.billingCity, customer.billingState].filter(Boolean).join(", ") ||
    "Location not added"
  );
}

export default async function ExistingCustomersPage() {
  const user = await requireChatGPTUser("/customers/existing");
  let savedCustomers: CustomerView[] = [];
  let unavailable = false;

  try {
    savedCustomers = await listCustomers(user.id);
  } catch (error) {
    console.error("Customer list unavailable", error);
    unavailable = true;
  }

  const directory = savedCustomers;

  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/customers"
          aria-label="Back to Customers"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section
        className="customer-directory"
        aria-labelledby="customer-directory-title"
      >
        <a className="back-link" href="/customers">
          ← Customers
        </a>
        <div className="directory-heading">
          <h1 id="customer-directory-title">Customers</h1>
          <span>{directory.length.toString().padStart(2, "0")}</span>
        </div>
        {unavailable && (
          <p className="directory-notice">
            Saved customers are temporarily unavailable.
          </p>
        )}
        <ListToolbar filters={[{label:"GST customers",value:"GST customer"},{label:"Non-GST customers",value:"Non-GST"}]}/>
        <div className="customer-list">
          {directory.map((customer, index) => (
            <a
              className="customer-row"
              href={`/customers/${customer.id}`}
              key={customer.id}
            >
              <span className="customer-index">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <span className="customer-identity">
                <strong>{customer.nickname || customer.displayName}</strong>
                <small>
                  {customer.nickname ? `${customer.displayName} · ` : ""}
                  {customer.gstRegistrationType === "unregistered"
                    ? "Non-GST"
                    : "GST customer"}
                </small>
              </span>
              <span className="customer-phone">
                +91 {customer.primaryPhone}
              </span>
              <span className="customer-location">{location(customer)}</span>
              <span className="customer-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          ))}
        </div>
      </section>
      <CommonsAssistant context="customers" />
    </main>
  );
}
