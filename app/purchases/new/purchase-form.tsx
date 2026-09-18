"use client";
import { companyFetch } from "@/app/company-fetch";
import { todayIST } from "@/app/lib/date";
import { FormEvent, useMemo, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
type Product = {
  id: string;
  name: string;
  itemType: string;
  unit: string;
  purchasePricePaise: number;
  gstRateBasisPoints: number;
};
export type PurchaseSupplier = {
  id: string;
  name: string;
  gstin: string;
  primaryPhone: string;
  state: string;
};
type Line = {
  productId: string;
  quantity: string;
  unitCost: string;
  gstRate: string;
};
export type PurchaseDraft = {
  sourceNumber: string;
  supplierId: string;
  supplierName: string;
  supplierGstin: string;
  status: "received" | "ordered";
  notes: string;
  lines: Line[];
};
const blank = (): Line => ({
  productId: "",
  quantity: "1",
  unitCost: "0",
  gstRate: "18",
});
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
export default function PurchaseForm({
  products,
  supplier,
  initialPurchase,
}: {
  products: Product[];
  supplier: PurchaseSupplier;
  initialPurchase?: PurchaseDraft | null;
}) {
  const [lines, setLines] = useState<Line[]>(
    initialPurchase?.lines.length ? initialPurchase.lines : [blank()],
  );
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const totals = useMemo(
    () =>
      lines.reduce(
        (sum, line) => {
          const base =
            (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
          return {
            subtotal: sum.subtotal + base,
            gst: sum.gst + (base * (Number(line.gstRate) || 0)) / 100,
          };
        },
        { subtotal: 0, gst: 0 },
      ),
    [lines],
  );
  function change(i: number, key: keyof Line, value: string) {
    setLines((current) =>
      current.map((line, index) =>
        index === i ? { ...line, [key]: value } : line,
      ),
    );
  }
  function choose(i: number, id: string) {
    const p = products.find((item) => item.id === id);
    setLines((current) =>
      current.map((line, index) =>
        index === i && p
          ? {
              productId: id,
              quantity: line.quantity,
              unitCost: (p.purchasePricePaise / 100).toString(),
              gstRate: (p.gstRateBasisPoints / 100).toString(),
            }
          : index === i
            ? { ...line, productId: id }
            : line,
      ),
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lines.every((line) => line.productId)) {
      setStatus("error");
      setMessage("Select an item for every purchase line.");
      return;
    }
    setStatus("saving");
    setMessage("");
    const form=new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      itcEligible:form.get("itcEligible")==="on",
      reverseCharge:form.get("reverseCharge")==="on",
      lines,
    };
    try {
      const response = await companyFetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        number?: string;
      };
      if (!response.ok || !result.number)
        throw new Error(result.message || "Could not save purchase.");
      window.location.href =
        "/purchases/existing?saved=" + encodeURIComponent(result.number);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save purchase.",
      );
    }
  }
  return (
    <form className="bill-builder" id="purchase-form" onSubmit={submit}>
      <input name="supplierId" type="hidden" value={supplier.id} />
      <input name="supplierName" type="hidden" value={supplier.name} />
      <input name="supplierGstin" type="hidden" value={supplier.gstin} />
      <div className="bill-heading">
        <div>
          <span>Procurement</span>
          <h1>{initialPurchase ? "Repeat purchase" : "New purchase"}</h1>
        </div>
        <div className="purchase-heading-controls">
          <label>
            <span>Purchase date</span>
            <input
              name="purchaseDate"
              type="date"
              defaultValue={todayIST()}
              required
            />
          </label>
          <button
            className="save-customer purchase-save-top"
            type="submit"
            disabled={status === "saving" || products.length === 0}
          >
            <Check /> {status === "saving" ? "Saving…" : "Save purchase"}
          </button>
        </div>
      </div>
      {initialPurchase && (
        <div className="repeat-notice">
          <Copy aria-hidden="true" />
          <span>
            Repeating <strong>{initialPurchase.sourceNumber}</strong>. A new
            purchase number will be created when you save.
          </span>
        </div>
      )}
      {products.length === 0 && (
        <div className="directory-notice">
          Add a raw material or resale product before recording a purchase.
        </div>
      )}
      <section className="bill-section">
        <div className="section-heading">
          <h2>Supplier</h2>
          {supplier.id && (
            <a className="section-text-action" href={`/purchases/suppliers/${supplier.id}`}>
              View profile ↗
            </a>
          )}
        </div>
        <div className="selected-supplier">
          <span>
            <strong>{supplier.name}</strong>
            <small>{supplier.gstin || "Unregistered supplier"}</small>
          </span>
          <span>
            <small>{supplier.primaryPhone ? `+91 ${supplier.primaryPhone}` : "Phone not available"}</small>
            <small>{supplier.state || "State not added"}</small>
          </span>
        </div>
        <div className="form-grid purchase-reference-grid">
          <label>
            <span>Supplier invoice number</span>
            <input name="supplierInvoiceNumber" />
          </label>
          <label>
            <span>Status</span>
            <select
              name="status"
              defaultValue={initialPurchase?.status || "received"}
            >
              <option value="received">Received</option>
              <option value="ordered">Ordered</option>
            </select>
          </label>
          <label><span>Place of supply</span><input name="placeOfSupply" defaultValue={supplier.state}/></label>
          <label className="check-field"><input type="checkbox" name="itcEligible" defaultChecked/><span>Input tax credit appears eligible in books</span></label>
          <label className="check-field"><input type="checkbox" name="reverseCharge"/><span>Reverse charge applies</span></label>
          <label>
            <span>TDS section (if applicable)</span>
            <select name="tdsSectionCode" defaultValue="">
              <option value="">No TDS</option>
              <option value="194C">194C — Contractors</option>
              <option value="194J">194J — Professional/technical fees</option>
              <option value="194Q">194Q — Purchase of goods</option>
              <option value="194I">194I — Rent</option>
              <option value="194H">194H — Commission/brokerage</option>
            </select>
          </label>
          <label><span>TDS rate (%)</span><input name="tdsRate" type="number" min="0" max="30" step="0.01" defaultValue="0"/></label>
        </div>
      </section>
      <section className="bill-section">
        <div className="section-heading">
          <h2>Items</h2>
          <div className="section-inline-actions">
            {supplier.id && (
              <a className="line-add" href={`/purchases/suppliers/${supplier.id}/products/new`}>
                + New product
              </a>
            )}
            <button
              className="line-add"
              type="button"
              onClick={() => setLines((current) => [...current, blank()])}
            >
              <Plus /> Add item
            </button>
          </div>
        </div>
        <div className="purchase-lines">
          {lines.map((line, i) => {
            const p = products.find((item) => item.id === line.productId);
            return (
              <div className="purchase-line" key={i}>
                <label>
                  <span>Raw material / resale item</span>
                  <select
                    value={line.productId}
                    onChange={(e) => choose(i, e.target.value)}
                    required
                  >
                    <option value="">Select item</option>
                    {products.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} · {item.itemType.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Quantity {p ? `(${p.unit})` : ""}</span>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={line.quantity}
                    onChange={(e) => change(i, "quantity", e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Unit cost ₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(e) => change(i, "unitCost", e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>GST %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={line.gstRate}
                    onChange={(e) => change(i, "gstRate", e.target.value)}
                  />
                </label>
                <button
                  className="line-remove"
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, index) => index !== i),
                    )
                  }
                  aria-label={`Remove purchase item ${i + 1}`}
                >
                  <Trash2 />
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="bill-section bill-final">
        <label>
          <span>Notes</span>
          <textarea
            name="notes"
            rows={4}
            defaultValue={initialPurchase?.notes || ""}
          />
        </label>
        <div className="bill-total">
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(totals.subtotal)}</dd>
            </div>
            <div>
              <dt>Input GST</dt>
              <dd>{money(totals.gst)}</dd>
            </div>
            <div className="grand-total">
              <dt>Total</dt>
              <dd>{money(totals.subtotal + totals.gst)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="form-footer">
        <div className={`form-status ${status}`}>{message}</div>
        <button
          className="save-customer"
          type="submit"
          disabled={status === "saving" || products.length === 0}
        >
          {status === "saving" ? "Saving…" : "Save purchase"}
        </button>
      </div>
    </form>
  );
}
