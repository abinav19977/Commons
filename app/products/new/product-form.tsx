"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useState } from "react";

const units = [
  "PCS",
  "NOS",
  "BOX",
  "SET",
  "PAIR",
  "KG",
  "GRAM",
  "LTR",
  "ML",
  "MTR",
  "SQM",
  "FT",
  "HOUR",
  "DAY",
];

export default function ProductForm({
  supplier,
  returnTo,
}: {
  supplier?: { id: string; name: string } | null;
  returnTo?: string;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload:Record<string,FormDataEntryValue|boolean> = Object.fromEntries(formData.entries());
    payload.priceIncludesTax = formData.get("priceIncludesTax") === "on";
    payload.active = formData.get("active") === "on";

    try {
      const response = await companyFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !result.id)
        throw new Error(result.message || "Could not save the product.");
      if (returnTo) {
        window.location.href = `${returnTo}?productSaved=1`;
        return;
      }
      form.reset();
      setStatus("success");
      setMessage("Product saved successfully.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save the product.",
      );
    }
  }

  return (
    <form className="customer-form product-form" onSubmit={submitProduct}>
      {supplier && <input name="supplierId" type="hidden" value={supplier.id} />}
      <div className="customer-name-section">
        <label>
          <span>Product name *</span>
          <input
            name="name"
            required
            maxLength={140}
            placeholder="Enter product or service name"
            autoFocus
          />
        </label>
      </div>

      <fieldset className="form-section">
        <legend>Product details</legend>
        <div className="form-grid">
          <label>
            <span>Item type</span>
            <select name="itemType" defaultValue="resale_product">
              <option value="resale_product">Resale product</option>
              <option value="manufactured_product">Manufactured product</option>
              <option value="raw_material">Raw material</option>
              <option value="service">Service</option>
            </select>
          </label>
          <label>
            <span>Category</span>
            <input
              name="category"
              maxLength={100}
              placeholder="e.g. Drinkware"
            />
          </label>
          <label>
            <span>SKU / item code</span>
            <input
              name="sku"
              maxLength={50}
              placeholder="SSB-1L-BLK"
              className="uppercase-input"
            />
          </label>
          <label>
            <span>Barcode</span>
            <input
              name="barcode"
              inputMode="numeric"
              maxLength={32}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>HSN / SAC code</span>
            <input
              name="hsnSac"
              inputMode="numeric"
              maxLength={8}
              placeholder="e.g. 73239390"
            />
          </label>
          <label>
            <span>Unit</span>
            <select name="unit" defaultValue="PCS">
              {units.map((unit) => (
                <option value={unit} key={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Pricing & tax</legend>
        <div className="form-grid">
          <label>
            <span>Purchase price (₹)</span>
            <input
              name="purchasePrice"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Selling price (₹) *</span>
            <input
              name="salePrice"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue="0"
            />
          </label>
          <label>
            <span>GST rate</span>
            <select name="gstRate" defaultValue="18">
              <option value="0">0%</option>
              <option value="0.1">0.1%</option>
              <option value="0.25">0.25%</option>
              <option value="3">3%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </label>
          <label>
            <span>Cess rate (%)</span>
            <input
              name="cessRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue="0"
            />
          </label>
        </div>
        <label className="check-field section-check">
          <input name="priceIncludesTax" type="checkbox" />
          <span>Prices include GST</span>
        </label>
      </fieldset>

      <fieldset className="form-section">
        <legend>Inventory</legend>
        <div className="form-grid">
          <label>
            <span>Opening stock</span>
            <input
              name="openingStock"
              type="number"
              min="0"
              step="0.001"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Low-stock alert at</span>
            <input
              name="reorderLevel"
              type="number"
              min="0"
              step="0.001"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Warehouse / location</span>
            <input name="warehouse" maxLength={100} placeholder="Main Godown" />
          </label>
          <label>
            <span>Preferred supplier</span>
            <input
              name="supplier"
              maxLength={140}
              defaultValue={supplier?.name || ""}
              readOnly={Boolean(supplier)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Other</legend>
        <div className="form-grid">
          <label className="wide-field">
            <span>Description</span>
            <textarea name="description" rows={4} maxLength={1000} />
          </label>
        </div>
        <label className="check-field section-check">
          <input name="active" type="checkbox" defaultChecked />
          <span>Product is active</span>
        </label>
      </fieldset>

      <div className="form-footer">
        <div
          className={"form-status " + status}
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
          {status === "saving" ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
