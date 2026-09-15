import { getRawDb } from "../../db";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";
import GstWorkspace, { type FilingHistory } from "./gst-workspace";

export const dynamic = "force-dynamic";

function Mark() {
  return (
    <svg className="brand-mark brand-mark-small" aria-hidden="true" viewBox="0 0 128 128" fill="none">
      <path d="M99 34A47 47 0 1 0 99 94" stroke="currentColor" strokeWidth="15" />
      <path d="M91 34H111M91 94H111" stroke="currentColor" strokeWidth="7" />
    </svg>
  );
}

export default async function GstPage() {
  const user = await requireChatGPTUser("/gst");
  let history: FilingHistory[] = [];
  try {
    const rows = await getRawDb()
      .prepare(
        "SELECT id,period_start,period_end,return_type,estimated_net_paise,issue_count,analysis_mode FROM gst_filing_sessions WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 6",
      )
      .bind(user.id)
      .all<Record<string, unknown>>();
    history = (rows.results || []).map((row) => ({
      id: String(row.id),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      returnType: String(row.return_type),
      estimatedNetPaise: Number(row.estimated_net_paise || 0),
      issueCount: Number(row.issue_count || 0),
      analysisMode: String(row.analysis_mode || "analytical"),
    }));
  } catch (error) {
    console.error("GST history unavailable", error);
  }
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/" aria-label="Back to Commons"><Mark /></a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>Sign out</a>
      </header>
      <section className="operations-page gst-page">
        <a className="back-link" href="/workspace">← Workspace</a>
        <div className="operations-heading">
          <span>GST compliance</span>
          <h1>Filing assistant</h1>
          <p>Review recorded tax, potential input credit and filing risks before using the GST portal.</p>
        </div>
        <GstWorkspace history={history} />
      </section>
      <CommonsAssistant context="gst" />
    </main>
  );
}
