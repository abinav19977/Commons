"use client";
import { companyFetch } from "@/app/company-fetch";
import { FormEvent, useState } from "react";
type Profile = {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pinCode: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  invoicePrefix: string;
  terms: string;
};
const states = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Andaman and Nicobar Islands",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Lakshadweep",
];
export default function BusinessForm({ profile, createOnly=false }: { profile: Profile | null; createOnly?: boolean }) {
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      const response = await companyFetch(createOnly ? "/api/companies" : "/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...payload, createOnly}),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Could not save the profile.");
      setStatus("success");
      setMessage("Business profile saved.");
      if (createOnly) window.location.assign("/workspace");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save the profile.",
      );
    }
  }
  return (
    <form className="customer-form" onSubmit={submit}>
      <div className="customer-name-section">
        <label>
          <span>Legal business name *</span>
          <input
            name="legalName"
            required
            defaultValue={profile?.legalName || ""}
            maxLength={160}
            placeholder="Enter registered business name"
            autoFocus
          />
        </label>
      </div>
      <fieldset className="form-section">
        <legend>Business & tax</legend>
        <div className="form-grid">
          <label>
            <span>Trade name</span>
            <input name="tradeName" defaultValue={profile?.tradeName} />
          </label>
          <label>
            <span>Phone</span>
            <input name="phone" defaultValue={profile?.phone} />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" defaultValue={profile?.email} />
          </label>
          <label>
            <span>GSTIN</span>
            <input
              name="gstin"
              className="uppercase-input"
              maxLength={15}
              defaultValue={profile?.gstin}
            />
          </label>
          <label>
            <span>PAN</span>
            <input
              name="pan"
              className="uppercase-input"
              maxLength={10}
              defaultValue={profile?.pan}
            />
          </label>
          <label>
            <span>Invoice prefix</span>
            <input
              name="invoicePrefix"
              className="uppercase-input"
              maxLength={12}
              defaultValue={profile?.invoicePrefix || "INV"}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Registered address</legend>
        <div className="form-grid">
          <label className="wide-field">
            <span>Address line 1</span>
            <input name="addressLine1" defaultValue={profile?.addressLine1} />
          </label>
          <label className="wide-field">
            <span>Address line 2</span>
            <input name="addressLine2" defaultValue={profile?.addressLine2} />
          </label>
          <label>
            <span>City</span>
            <input name="city" defaultValue={profile?.city} />
          </label>
          <label>
            <span>State / UT</span>
            <select name="state" defaultValue={profile?.state || ""}>
              <option value="">Select state or UT</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span>PIN code</span>
            <input
              name="pinCode"
              maxLength={6}
              defaultValue={profile?.pinCode}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Bank & invoice</legend>
        <div className="form-grid">
          <label>
            <span>Bank name</span>
            <input name="bankName" defaultValue={profile?.bankName} />
          </label>
          <label>
            <span>Account name</span>
            <input name="accountName" defaultValue={profile?.accountName} />
          </label>
          <label>
            <span>Account number</span>
            <input name="accountNumber" defaultValue={profile?.accountNumber} />
          </label>
          <label>
            <span>IFSC</span>
            <input
              name="ifsc"
              className="uppercase-input"
              maxLength={11}
              defaultValue={profile?.ifsc}
            />
          </label>
          <label className="wide-field">
            <span>Default payment terms</span>
            <textarea
              name="terms"
              rows={3}
              defaultValue={profile?.terms || "Payment due within 30 days."}
            />
          </label>
        </div>
      </fieldset>
      <div className="form-footer">
        <div className={"form-status " + status}>{message}</div>
        <button className="save-customer" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
