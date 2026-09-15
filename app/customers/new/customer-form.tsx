"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useState } from "react";

const states = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
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

function StateSelect({
  name,
  required = false,
}: {
  name: string;
  required?: boolean;
}) {
  return (
    <select name={name} required={required} defaultValue="">
      <option value="" disabled>
        Select state or UT
      </option>
      {states.map((state) => (
        <option value={state} key={state}>
          {state}
        </option>
      ))}
    </select>
  );
}

export default function CustomerForm({
  gstMode = "non_gst",
}: {
  gstMode?: "gst" | "non_gst";
}) {
  const [shippingSame, setShippingSame] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload:Record<string,FormDataEntryValue|boolean> = Object.fromEntries(formData.entries());
    payload.shippingSameAsBilling =
      formData.get("shippingSameAsBilling") === "on";

    try {
      const response = await companyFetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok)
        throw new Error(result.message || "Could not save the customer.");

      form.reset();
      setShippingSame(true);
      setStatus("success");
      setMessage("Customer saved successfully.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save the customer.",
      );
    }
  }

  return (
    <form className="customer-form" onSubmit={submitCustomer}>
      <div className="customer-name-section">
        <label>
          <span>Customer name *</span>
          <input
            name="displayName"
            required
            maxLength={120}
            autoComplete="organization"
            placeholder="Enter customer or business name"
            autoFocus
          />
        </label>
      </div>

      <fieldset className="form-section">
        <legend>Customer details</legend>
        <div className="form-grid">
          <label>
            <span>Customer type</span>
            <select name="customerType" defaultValue="business">
              <option value="business">Business</option>
              <option value="individual">Individual</option>
            </select>
          </label>
          <label>
            <span>Nickname</span>
            <input
              name="nickname"
              maxLength={80}
              placeholder="Short name used in summaries"
            />
          </label>
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
          {gstMode === "gst" ? (
            <>
              <label>
                <span>GST registration</span>
                <select name="gstRegistrationType" defaultValue="regular">
                  <option value="regular">Regular</option>
                  <option value="composition">Composition</option>
                  <option value="sez">SEZ</option>
                  <option value="overseas">Overseas</option>
                </select>
              </label>
              <label>
                <span>GSTIN *</span>
                <input
                  name="gstin"
                  required
                  maxLength={15}
                  placeholder="22AAAAA0000A1Z5"
                  className="uppercase-input"
                />
              </label>
            </>
          ) : (
            <>
              <input type="hidden" name="gstRegistrationType" value="unregistered" />
              <div className="classification-field">
                <span>GST registration</span>
                <strong>Unregistered / consumer</strong>
              </div>
            </>
          )}
          <label>
            <span>PAN</span>
            <input
              name="pan"
              maxLength={10}
              placeholder="AAAAA0000A"
              className="uppercase-input"
            />
          </label>
          <label>
            <span>Bank account last 4 digits</span>
            <input
              name="bankAccountLast4"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              placeholder="Used for bank matching"
            />
          </label>
          <label>
            <span>Place of supply</span>
            <StateSelect name="placeOfSupply" />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Billing address</legend>
        <div className="form-grid">
          <label className="wide-field">
            <span>Address line 1</span>
            <input
              name="billingAddressLine1"
              maxLength={180}
              autoComplete="address-line1"
            />
          </label>
          <label className="wide-field">
            <span>Address line 2</span>
            <input
              name="billingAddressLine2"
              maxLength={180}
              autoComplete="address-line2"
            />
          </label>
          <label>
            <span>City</span>
            <input
              name="billingCity"
              maxLength={80}
              autoComplete="address-level2"
            />
          </label>
          <label>
            <span>State / UT</span>
            <StateSelect name="billingState" />
          </label>
          <label>
            <span>PIN code</span>
            <input
              name="billingPinCode"
              inputMode="numeric"
              maxLength={6}
              pattern="[1-9][0-9]{5}"
              placeholder="400001"
              autoComplete="postal-code"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Shipping address</legend>
        <label className="check-field">
          <input
            name="shippingSameAsBilling"
            type="checkbox"
            defaultChecked
            onChange={(event) => setShippingSame(event.target.checked)}
          />
          <span>Same as billing address</span>
        </label>
        {!shippingSame && (
          <div className="form-grid shipping-grid">
            <label className="wide-field">
              <span>Address line 1</span>
              <input
                name="shippingAddressLine1"
                maxLength={180}
                autoComplete="shipping address-line1"
              />
            </label>
            <label className="wide-field">
              <span>Address line 2</span>
              <input
                name="shippingAddressLine2"
                maxLength={180}
                autoComplete="shipping address-line2"
              />
            </label>
            <label>
              <span>City</span>
              <input name="shippingCity" maxLength={80} />
            </label>
            <label>
              <span>State / UT</span>
              <StateSelect name="shippingState" />
            </label>
            <label>
              <span>PIN code</span>
              <input
                name="shippingPinCode"
                inputMode="numeric"
                maxLength={6}
                pattern="[1-9][0-9]{5}"
                placeholder="400001"
              />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="form-section">
        <legend>Credit & balance</legend>
        <div className="form-grid">
          <label>
            <span>Credit period (days)</span>
            <input
              name="creditDays"
              type="number"
              min="0"
              max="3650"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Credit limit (₹)</span>
            <input
              name="creditLimit"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Opening balance (₹)</span>
            <input
              name="openingBalance"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Balance type</span>
            <select name="balanceType" defaultValue="receivable">
              <option value="receivable">Receivable</option>
              <option value="payable">Payable</option>
            </select>
          </label>
          <label className="wide-field">
            <span>Notes</span>
            <textarea name="notes" rows={4} maxLength={1000} />
          </label>
        </div>
      </fieldset>

      <div className="form-footer">
        <div
          className={`form-status ${status}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
        <button
          className="save-customer"
          type="submit"
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save customer"}
        </button>
      </div>
    </form>
  );
}
