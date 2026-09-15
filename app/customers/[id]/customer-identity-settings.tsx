"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useState } from "react";
import { Save } from "lucide-react";

export default function CustomerIdentitySettings({
  id,
  initialNickname,
  initialBankAccountLast4,
}: {
  id: string;
  initialNickname: string;
  initialBankAccountLast4: string;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [bankAccountLast4, setBankAccountLast4] = useState(initialBankAccountLast4);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await companyFetch("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, nickname, bankAccountLast4 }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not update customer.");
      setStatus("success");
      setMessage("Saved. Bank matching and summaries now use these identifiers.");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not update customer.");
    }
  }

  return (
    <form className="customer-identity-settings" onSubmit={save}>
      <div>
        <span className="panel-kicker">Summary & matching</span>
        <strong>Customer identifiers</strong>
      </div>
      <label><span>Nickname</span><input maxLength={80} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Short summary name" /></label>
      <label><span>Bank account last 4</span><input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={bankAccountLast4} onChange={(event) => setBankAccountLast4(event.target.value.replace(/\D/g, ""))} placeholder="0000" /></label>
      <button disabled={status === "saving"}><Save />Save</button>
      <p className={`form-status ${status}`} role="status">{message}</p>
    </form>
  );
}
