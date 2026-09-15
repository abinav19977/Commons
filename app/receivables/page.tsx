import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";
import ReminderCenter from "./reminder-center";
import {
  defaultReceivableSettings,
  getReceivableReminders,
  getReceivableSettings,
  type ReceivableReminder,
} from "./receivables-data";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

export default async function ReceivablesPage() {
  const user = await requireChatGPTUser("/receivables");
  let settings = defaultReceivableSettings;
  let reminders: ReceivableReminder[] = [];
  let unavailable = false;
  try {
    settings = await getReceivableSettings(user.id);
    reminders = await getReceivableReminders(user.id, settings);
  } catch (error) {
    console.error("Receivable reminders unavailable", error);
    unavailable = true;
  }
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/" aria-label="Back to Commons"><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="operations-page">
        <a className="back-link" href="/workspace">← Workspace</a>
        <div className="operations-heading">
          <span>Collections</span>
          <h1>Receivables</h1>
          <p>Prioritise overdue customers and prepare consistent payment reminders.</p>
        </div>
        {unavailable && <p className="directory-notice">Live receivables are temporarily unavailable.</p>}
        <ReminderCenter initialSettings={settings} reminders={reminders} />
      </section>
      <CommonsAssistant context="receivables" />
    </main>
  );
}
