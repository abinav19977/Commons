import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { type SupplierView } from "../supplier-data";
import ListToolbar from "../../components/list-toolbar";
import { listSuppliers } from "../supplier-store";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

function location(supplier: SupplierView) {
  return [supplier.city, supplier.state].filter(Boolean).join(", ") || "Location not added";
}

export default async function SuppliersPage() {
  const user = await requireChatGPTUser("/purchases/suppliers");
  let saved: SupplierView[] = [];
  let unavailable = false;
  try {
    saved = await listSuppliers(user.id);
  } catch (error) {
    console.error("Supplier list unavailable", error);
    unavailable = true;
  }
  const directory = saved;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/purchases" aria-label="Back to Purchases"><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="customer-directory" aria-labelledby="supplier-directory-title">
        <a className="back-link" href="/purchases">← Purchases</a>
        <div className="directory-heading directory-heading-actions">
          <h1 id="supplier-directory-title">Suppliers</h1>
          <a className="dashboard-primary compact-action" href="/purchases/suppliers/new">+ Add supplier</a>
        </div>
        {unavailable && <p className="directory-notice">Saved suppliers are temporarily unavailable.</p>}
        <ListToolbar filters={[{label:"GST suppliers",value:"GST"},{label:"Non-GST suppliers",value:"Non-GST"}]}/>
        <div className="customer-list">
          {directory.map((supplier, index) => (
            <a className="customer-row supplier-row" href={`/purchases/suppliers/${supplier.id}`} key={supplier.id}>
              <span className="customer-index">{(index + 1).toString().padStart(2, "0")}</span>
              <span className="customer-identity">
                <strong>{supplier.name}</strong>
                <small>{supplier.contactName || "No contact person"} · {supplier.gstRegistrationType === "unregistered" ? "Non-GST" : "GST supplier"}</small>
              </span>
              <span className="customer-phone">+91 {supplier.primaryPhone}</span>
              <span className="customer-location">{location(supplier)}</span>
              <span className="customer-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
      <CommonsAssistant context="purchases" />
    </main>
  );
}
