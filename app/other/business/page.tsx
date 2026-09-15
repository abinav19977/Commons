import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { businessProfiles } from "../../../db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import BusinessForm from "./business-form";
import { demoBusinessProfile } from "./demo-profile";

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
export default async function BusinessPage() {
  const user = await requireChatGPTUser("/other/business");
  let profile: null | typeof businessProfiles.$inferSelect = null;
  try {
    profile =
      (
        await getDb()
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.ownerUserId, user.id))
          .limit(1)
      )[0] || null;
  } catch (error) {
    console.error("Business profile unavailable", error);
  }
  const shown = profile
    ? {
        legalName: profile.legalName,
        tradeName: profile.tradeName || "",
        gstin: profile.gstin || "",
        pan: profile.pan || "",
        phone: profile.phone || "",
        email: profile.email || "",
        addressLine1: profile.addressLine1 || "",
        addressLine2: profile.addressLine2 || "",
        city: profile.city || "",
        state: profile.state || "",
        pinCode: profile.pinCode || "",
        bankName: profile.bankName || "",
        accountName: profile.accountName || "",
        accountNumber: profile.accountNumber || "",
        ifsc: profile.ifsc || "",
        invoicePrefix: profile.invoicePrefix,
        terms: profile.terms || "",
      }
    : demoBusinessProfile;
  return (
    <main className="form-shell">
      <header className="site-header workspace-header">
        <a className="wordmark" href="/other" aria-label="Back to Other">
          <CommonsMark />
        </a>
        <a className="header-action" href={chatGPTSignOutPath("/")}>
          Sign out
        </a>
      </header>
      <section className="customer-form-wrap">
        <a className="back-link" href="/other">
          ← Other
        </a>
        {!profile && (
          <div className="setup-warning">
            Example business details are prefilled. Review them and save your
            profile before generating a bill.
          </div>
        )}
        <BusinessForm profile={shown} />
      </section>
      <CommonsAssistant context="business" />
    </main>
  );
}
