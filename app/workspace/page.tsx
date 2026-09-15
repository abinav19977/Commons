import { redirect } from "next/navigation";
import { getRawDb } from "../../db";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  requireChatGPTUser,
} from "../company-auth";
import {
  ChartNoAxesCombined,
  BellRing,
  Banknote,
  BookOpenCheck,
  Grid2X2,
  Landmark,
  WalletCards,
  Package,
  ReceiptText,
  ShoppingCart,
  Settings2,
  CircleHelp,
  ArrowLeftRight,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import CommonsAssistant from "../components/commons-assistant";

export const dynamic = "force-dynamic";

function CommonsMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "brand-mark brand-mark-small" : "brand-mark"}
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

export default async function Home() {
  const user = await requireChatGPTUser("/workspace");
  const signIn = chatGPTSignInPath("/workspace");
  if (!user) redirect(signIn);
  const profile = await getRawDb().prepare("SELECT legal_name FROM business_profiles WHERE owner_user_id=?").bind(user.id).first<{legal_name:string}>();
  if (!profile) redirect("/companies/new");

  if (user) {
    const businessSections = [
      { label: "Dashboard", icon: ChartNoAxesCombined, href: "/dashboard" },
      { label: "Customers", icon: UsersRound, href: "/customers" },
      { label: "Products", icon: Package, href: "/products" },
      { label: "Purchases", icon: ShoppingCart, href: "/purchases" },
      { label: "Sales & Bills", icon: ReceiptText, href: "/transactions" },
      { label: "Employees", icon: UserRoundCog, href: "/employees" },
      { label: "Receivables", icon: BellRing, href: "/receivables" },
      { label: "Business Setup", icon: Grid2X2, href: "/other" },
    ];
    const accountsSections = [
      { label: "Books & Reports", icon: BookOpenCheck, href: "/accounts" },
      { label: "Finance", icon: WalletCards, href: "/finance" },
      { label: "GST Filing", icon: Landmark, href: "/gst" },
      { label: "Bank Matching", icon: Banknote, href: "/banking" },
      { label: "Tally Sync", icon: ArrowLeftRight, href: "/integrations/tally" },
      { label: "Settings", icon: Settings2, href: "/settings" },
      { label: "Help", icon: CircleHelp, href: "/help" },
    ];

    return (
      <main className="workspace-shell">
        <header className="site-header workspace-header">
          <a className="wordmark" href="/" aria-label="Commons home">
            <CommonsMark small />
          </a>
          <a className="header-action" href={chatGPTSignOutPath("/")}>
            Sign out
          </a>
        </header>
        <section className="workspace" aria-label="Commons navigation"><div className="company-context"><h1>{profile.legal_name}</h1><a href="/companies">Change company →</a></div>
          <div className="universe-heading"><h2>Business</h2></div>
          <nav className="tool-grid" aria-label="Daily business tools">
            {businessSections.map(({ label, icon: Icon, href }, index) => {
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
          <div className="universe-heading accounting-universe"><h2>Accounting</h2></div>
          <nav className="tool-grid" aria-label="Accounts and finance tools">
            {accountsSections.map(({ label, icon: Icon, href }, index) => <a className="tool-tile" href={href} key={label}><span className="tool-number">{String(index+1).padStart(2,"0")}</span><Icon aria-hidden="true" strokeWidth={1.45}/><span className="tool-label">{label}</span></a>)}
          </nav>
        </section>
        <CommonsAssistant context="dashboard" />
      </main>
    );
  }

  return (
    <main className="home-shell">
      <section className="hero" aria-labelledby="commons-title">
        <CommonsMark />
        <h1 id="commons-title">commons</h1>
        <a className="primary-action" href={signIn} target="_top">
          Next
        </a>
      </section>
    </main>
  );
}
