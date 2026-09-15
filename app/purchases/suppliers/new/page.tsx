import { chatGPTSignOutPath, requireChatGPTUser } from "../../../company-auth";
import CommonsAssistant from "../../../components/commons-assistant";
import SupplierForm from "./supplier-form";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

export default async function NewSupplierPage() {
  await requireChatGPTUser("/purchases/suppliers/new");
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/purchases" aria-label="Back to Purchases">
          <Mark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="customer-form-wrap" aria-label="Add supplier">
        <a className="back-link" href="/purchases">← Purchases</a>
        <SupplierForm />
      </section>
      <CommonsAssistant context="purchases" />
    </main>
  );
}
