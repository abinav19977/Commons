import { BadgeCheck, ContactRound, UserRound } from "lucide-react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../company-auth";
import CommonsAssistant from "../components/commons-assistant";

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

export default async function CustomersPage() {
  await requireChatGPTUser("/customers");

  const options = [
    {
      label: "GST Customer",
      icon: BadgeCheck,
      href: "/customers/new?type=gst",
    },
    {
      label: "Non-GST Customer",
      icon: UserRound,
      href: "/customers/new?type=non-gst",
    },
    {
      label: "Existing Customer",
      icon: ContactRound,
      href: "/customers/existing",
    },
  ];

  return (
    <main className="workspace-shell">
      <header className="site-header workspace-header">
        <a
          className="wordmark"
          href="/"
          aria-label="Back to Commons navigation"
        >
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="workspace" aria-label="Customer options">
        <a className="back-link" href="/workspace">
          ← Workspace
        </a>
        <nav className="tool-grid" aria-label="Customers">
          {options.map(({ label, icon: Icon, href }, index) => {
            const content = (
              <>
                <span className="tool-number">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
                <Icon aria-hidden="true" strokeWidth={1.45} />
                <span className="tool-label">{label}</span>
              </>
            );

            return href ? (
              <a className="tool-tile" href={href} key={label}>
                {content}
              </a>
            ) : (
              <button className="tool-tile" type="button" key={label}>
                {content}
              </button>
            );
          })}
        </nav>
      </section>
      <CommonsAssistant context="customers" />
    </main>
  );
}
