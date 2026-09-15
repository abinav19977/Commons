import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CustomerForm from "./customer-form";
import CommonsAssistant from "../../components/commons-assistant";

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

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireChatGPTUser("/customers/new");
  const { type } = await searchParams;
  const gstMode = type === "gst" ? "gst" : "non_gst";

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
      <section className="customer-form-wrap" aria-label="Add customer">
        <a className="back-link" href="/customers">
          ← Customers
        </a>
        <div className="customer-classification">
          <span>{gstMode === "gst" ? "GST registered" : "Unregistered / consumer"}</span>
          <strong>{gstMode === "gst" ? "GST customer" : "Non-GST customer"}</strong>
          <p>
            {gstMode === "gst"
              ? "GSTIN and place-of-supply details will be used for compliant tax documents."
              : "Documents and summaries will always retain the customer’s actual name. Only compliant B2C records may be created."}
          </p>
        </div>
        <CustomerForm gstMode={gstMode} />
      </section>
      <CommonsAssistant context="customers" />
    </main>
  );
}
