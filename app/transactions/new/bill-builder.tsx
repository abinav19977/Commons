"use client";
import { companyFetch } from "@/app/company-fetch";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Customer = {
  id: string;
  displayName: string;
  gstin: string | null;
  placeOfSupply: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPinCode: string | null;
};
type Product = {
  id: string;
  name: string;
  hsnSac: string | null;
  unit: string;
  salePricePaise: number;
  gstRateBasisPoints: number;
  cessRateBasisPoints: number;
};
type Profile = { legalName: string; state: string | null };
type Line = {
  productId: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  rate: string;
  gstRate: string;
  cessRate: string;
};
const blankLine = (): Line => ({
  productId: "",
  description: "",
  hsnSac: "",
  quantity: "1",
  unit: "PCS",
  rate: "0",
  gstRate: "18",
  cessRate: "0",
});
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

export default function BillBuilder() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [supplyType, setSupplyType] = useState("intra_state");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [discount, setDiscount] = useState("0");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const due = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);
  useEffect(() => {
    companyFetch("/api/billing-options")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Could not load billing data.");
        setCustomers(data.customers);
        setProducts(data.products);
        setProfile(data.profile);
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) =>
        sum + (Number(line.quantity) || 0) * (Number(line.rate) || 0),
      0,
    );
    const safeDiscount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
    const taxable = Math.max(0, subtotal - safeDiscount);
    const taxes = lines.reduce(
      (sum, line) => {
        const raw = (Number(line.quantity) || 0) * (Number(line.rate) || 0);
        const share = subtotal ? raw / subtotal : 0;
        const base = Math.max(0, raw - safeDiscount * share);
        return {
          gst: sum.gst + base * ((Number(line.gstRate) || 0) / 100),
          cess: sum.cess + base * ((Number(line.cessRate) || 0) / 100),
        };
      },
      { gst: 0, cess: 0 },
    );
    return {
      subtotal,
      discount: safeDiscount,
      total: taxable + taxes.gst + taxes.cess,
      cgst: supplyType === "intra_state" ? taxes.gst / 2 : 0,
      sgst: supplyType === "intra_state" ? taxes.gst / 2 : 0,
      igst: supplyType === "inter_state" ? taxes.gst : 0,
      cess: taxes.cess,
    };
  }, [lines, discount, supplyType]);
  function changeLine(index: number, key: keyof Line, value: string) {
    setLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  }
  function chooseProduct(index: number, id: string) {
    const product = products.find((p) => p.id === id);
    setLines((current) =>
      current.map((line, i) =>
        i === index
          ? product
            ? {
                productId: id,
                description: product.name,
                hsnSac: product.hsnSac || "",
                quantity: line.quantity,
                unit: product.unit,
                rate: (product.salePricePaise / 100).toString(),
                gstRate: (product.gstRateBasisPoints / 100).toString(),
                cessRate: (product.cessRateBasisPoints / 100).toString(),
              }
            : { ...line, productId: "" }
          : line,
      ),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const fd = new FormData(event.currentTarget);
    const customer = selectedCustomer;
    if (!customer) {
      setStatus("error");
      setMessage("Select a customer.");
      return;
    }
    const address = [
      customer.billingAddressLine1,
      customer.billingAddressLine2,
      customer.billingCity,
      customer.billingState,
      customer.billingPinCode,
    ]
      .filter(Boolean)
      .join(", ");
    const payload = {
      invoiceDate: fd.get("invoiceDate"),
      dueDate: fd.get("dueDate"),
      customerId: customer.id,
      customerName: customer.displayName,
      customerGstin: customer.gstin || "",
      customerAddress: address,
      placeOfSupply: customer.placeOfSupply || customer.billingState || "",
      supplyType,
      discount,
      notes: fd.get("notes"),
      lines,
    };
    try {
      const response = await companyFetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        message?: string;
        id?: string;
      };
      if (!response.ok || !result.id)
        throw new Error(result.message || "Could not generate the bill.");
      window.location.href = "/transactions/invoices/" + result.id;
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not generate the bill.",
      );
    }
  }
  return (
    <form className="bill-builder" onSubmit={submit}>
      <div className="bill-heading">
        <div>
          <span>GST invoice</span>
          <h1>Generate bill</h1>
        </div>
        <div className="bill-dates">
          <label>
            <span>Invoice date</span>
            <input
              name="invoiceDate"
              type="date"
              required
              defaultValue={today}
            />
          </label>
          <label>
            <span>Due date</span>
            <input name="dueDate" type="date" defaultValue={due} />
          </label>
        </div>
      </div>
      {!loading && !profile && (
        <div className="setup-warning">
          Complete your <a href="/other/business">Business Profile</a> before
          generating the bill.
        </div>
      )}
      <section className="bill-section">
        <h2>Customer</h2>
        <div className="form-grid">
          <label>
            <span>Customer *</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tax treatment</span>
            <select
              value={supplyType}
              onChange={(e) => setSupplyType(e.target.value)}
            >
              <option value="intra_state">Intra-state · CGST + SGST</option>
              <option value="inter_state">Inter-state · IGST</option>
            </select>
          </label>
        </div>
        {selectedCustomer && (
          <div className="selected-customer">
            <strong>{selectedCustomer.displayName}</strong>
            <span>
              {selectedCustomer.gstin || "Unregistered"} ·{" "}
              {selectedCustomer.placeOfSupply ||
                selectedCustomer.billingState ||
                "Place of supply not set"}
            </span>
          </div>
        )}
      </section>
      <section className="bill-section">
        <div className="section-heading">
          <h2>Items</h2>
          <button
            className="line-add"
            type="button"
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus /> Add line
          </button>
        </div>
        <div className="invoice-lines">
          {lines.map((line, index) => (
            <div className="invoice-line" key={index}>
              <label className="line-product">
                <span>Product / service</span>
                <select
                  value={line.productId}
                  onChange={(e) => chooseProduct(index, e.target.value)}
                >
                  <option value="">Custom item</option>
                  {products.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="line-description">
                <span>Description *</span>
                <input
                  value={line.description}
                  onChange={(e) =>
                    changeLine(index, "description", e.target.value)
                  }
                  required
                />
              </label>
              <label>
                <span>HSN/SAC</span>
                <input
                  value={line.hsnSac}
                  onChange={(e) => changeLine(index, "hsnSac", e.target.value)}
                  maxLength={8}
                />
              </label>
              <label>
                <span>Qty</span>
                <input
                  value={line.quantity}
                  onChange={(e) =>
                    changeLine(index, "quantity", e.target.value)
                  }
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                />
              </label>
              <label>
                <span>Unit</span>
                <input
                  value={line.unit}
                  onChange={(e) => changeLine(index, "unit", e.target.value)}
                  required
                />
              </label>
              <label>
                <span>Rate ₹</span>
                <input
                  value={line.rate}
                  onChange={(e) => changeLine(index, "rate", e.target.value)}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                <span>GST %</span>
                <input
                  value={line.gstRate}
                  onChange={(e) => changeLine(index, "gstRate", e.target.value)}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </label>
              <label>
                <span>Cess %</span>
                <input
                  value={line.cessRate}
                  onChange={(e) =>
                    changeLine(index, "cessRate", e.target.value)
                  }
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </label>
              <button
                className="line-remove"
                type="button"
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) => current.filter((_, i) => i !== index))
                }
                aria-label="Remove line"
              >
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="bill-section bill-final">
        <div>
          <label>
            <span>Notes</span>
            <textarea
              name="notes"
              rows={4}
              defaultValue="Thank you for your business."
            />
          </label>
        </div>
        <div className="bill-total">
          <label>
            <span>Discount ₹</span>
            <input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
            />
          </label>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div>
                <dt>Discount</dt>
                <dd>− {money(totals.discount)}</dd>
              </div>
            )}
            {supplyType === "intra_state" ? (
              <>
                <div>
                  <dt>CGST</dt>
                  <dd>{money(totals.cgst)}</dd>
                </div>
                <div>
                  <dt>SGST</dt>
                  <dd>{money(totals.sgst)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>IGST</dt>
                <dd>{money(totals.igst)}</dd>
              </div>
            )}
            {totals.cess > 0 && (
              <div>
                <dt>Cess</dt>
                <dd>{money(totals.cess)}</dd>
              </div>
            )}
            <div className="grand-total">
              <dt>Total</dt>
              <dd>{money(totals.total)}</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="form-footer">
        <div className={"form-status " + status}>{message}</div>
        <button
          className="save-customer"
          disabled={status === "saving" || loading}
        >
          {status === "saving" ? "Generating…" : "Generate bill"}
        </button>
      </div>
    </form>
  );
}
