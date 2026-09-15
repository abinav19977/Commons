import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { purchases } from "../../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import ListToolbar from "../../components/list-toolbar";
import PurchaseActions from "./purchase-actions";
export const dynamic = "force-dynamic";
type PageProps = {
  searchParams: Promise<{ saved?: string | string[] }>;
};
function Mark() {
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
export default async function History({ searchParams }: PageProps) {
  const user = await requireChatGPTUser("/purchases/existing");
  const params = await searchParams;
  const savedNumber = Array.isArray(params.saved)
    ? params.saved[0]
    : params.saved;
  let rows: Array<typeof purchases.$inferSelect> = [];
  try {
    rows = await getDb()
      .select()
      .from(purchases)
      .where(eq(purchases.ownerUserId, user.id))
      .orderBy(desc(purchases.purchaseDate));
  } catch (error) {
    console.error("Purchases unavailable", error);
  }
  const list = rows;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/purchases">
          <Mark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-directory">
        <a className="back-link" href="/purchases">
          ← Purchases
        </a>
        <div className="directory-heading">
          <h1>Purchases</h1>
          <span>{list.length.toString().padStart(2, "0")}</span>
        </div>
        {savedNumber && (
          <div className="purchase-saved" role="status">
            Purchase <strong>{savedNumber}</strong> saved successfully.
          </div>
        )}
        <ListToolbar filters={[{label:"Received",value:"received"},{label:"Ordered",value:"ordered"}]}/>
        <div className="customer-list">
          {list.map((p, i) => (
            <div className="customer-row purchase-row" key={p.id}>
              <span className="customer-index">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <a
                className="customer-identity purchase-supplier-link"
                href={
                  p.supplierId
                    ? `/purchases/suppliers/${encodeURIComponent(p.supplierId)}`
                    : "/purchases/suppliers"
                }
              >
                <strong>{p.supplierName}</strong>
                <small>
                  {p.purchaseNumber} ·{" "}
                  {p.supplierInvoiceNumber || "No supplier reference"}
                </small>
              </a>
              <span className="invoice-date">{p.purchaseDate}</span>
              <span className="invoice-status">{p.status}</span>
              <strong className="invoice-amount">{money(p.totalPaise)}</strong>
              <PurchaseActions id={p.id} status={p.status} />
            </div>
          ))}
        </div>
      </section>
      <CommonsAssistant context="purchases" />
    </main>
  );
}
