"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useState } from "react";

const states = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
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
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export default function SupplierForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const payload:Record<string,FormDataEntryValue|boolean> = Object.fromEntries(formData.entries());
    payload.active = formData.get("active") === "on";
    try {
      const response = await companyFetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !result.id)
        throw new Error(result.message || "Could not save the supplier.");
      window.location.href = `/purchases/suppliers/${result.id}?created=1`;
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save the supplier.",
      );
    }
  }

  return (
    <form className="customer-form" onSubmit={submitSupplier}>
      <div className="customer-name-section">
        <label>
          <span>Supplier name *</span>
          <input
            name="name"
            required
            maxLength={160}
            placeholder="Enter supplier or business name"
            autoComplete="organization"
            autoFocus
          />
        </label>
      </div>

      <fieldset className="form-section">
        <legend>Contact details</legend>
        <div className="form-grid">
          <label>
            <span>Contact person</span>
            <input name="contactName" maxLength={120} autoComplete="name" />
          </label>
          <label>
            <span>Primary phone *</span>
            <input
              name="primaryPhone"
              required
              inputMode="tel"
              maxLength={15}
              placeholder="9876543210"
              autoComplete="tel"
            />
          </label>
          <label>
            <span>Secondary phone</span>
            <input
              name="secondaryPhone"
              inputMode="tel"
              maxLength={15}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              maxLength={160}
              autoComplete="email"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>GST & tax</legend>
        <div className="form-grid">
          <label>
            <span>GST registration</span>
            <select name="gstRegistrationType" defaultValue="regular">
              <option value="regular">Regular</option>
              <option value="composition">Composition</option>
              <option value="unregistered">Unregistered</option>
              <option value="sez">SEZ</option>
              <option value="overseas">Overseas</option>
            </select>
          </label>
          <label>
            <span>GSTIN</span>
            <input
              name="gstin"
              maxLength={15}
              placeholder="32AAAAA0000A1Z5"
              className="uppercase-input"
            />
          </label>
          <label>
            <span>PAN</span>
            <input
              name="pan"
              maxLength={10}
              placeholder="AAAAA0000A"
              className="uppercase-input"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Address</legend>
        <div className="form-grid">
          <label className="wide-field">
            <span>Address line 1</span>
            <input name="addressLine1" maxLength={180} />
          </label>
          <label className="wide-field">
            <span>Address line 2</span>
            <input name="addressLine2" maxLength={180} />
          </label>
          <label>
            <span>City</span>
            <input name="city" maxLength={80} />
          </label>
          <label>
            <span>State / UT</span>
            <select name="state" defaultValue="">
              <option value="">Select state or UT</option>
              {states.map((state) => (
                <option value={state} key={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>PIN code</span>
            <input
              name="pinCode"
              inputMode="numeric"
              maxLength={6}
              pattern="[1-9][0-9]{5}"
              placeholder="673001"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Commercial terms</legend>
        <div className="form-grid">
          <label>
            <span>Payment terms (days)</span>
            <input
              name="paymentTermsDays"
              type="number"
              min="0"
              max="3650"
              defaultValue="30"
            />
          </label>
          <label>
            <span>Opening payable (₹)</span>
            <input
              name="openingPayable"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label className="wide-field">
            <span>Notes</span>
            <textarea name="notes" rows={4} maxLength={1000} />
          </label>
        </div>
        <label className="check-field section-check">
          <input name="active" type="checkbox" defaultChecked />
          <span>Supplier is active</span>
        </label>
      </fieldset>

      <div className="form-footer">
        <div className={`form-status ${status}`} role="status" aria-live="polite">
          {message}
        </div>
        <button
          className="save-customer"
          type="submit"
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save supplier"}
        </button>
      </div>
    </form>
  );
}
