"use client";
import { companyFetch } from "@/app/company-fetch";
import { todayIST } from "@/app/lib/date";

import { FormEvent, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Product = {
  id: string;
  itemType: string;
  name: string;
  sku: string | null;
  unit: string;
  purchasePricePaise: number;
  supplier: string | null;
  currentStockMilli: number;
};
type Material = Product & { itemType?: string };
type Consumption = { productId: string; quantity: string };

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
const qty = (milli: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(
    milli / 1000,
  );

export default function RestockForm({
  product,
  materials,
}: {
  product: Product;
  materials: Material[];
}) {
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(
    (product.purchasePricePaise / 100).toFixed(2),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const total = useMemo(
    () =>
      Math.max(0, Number(quantity) || 0) * Math.max(0, Number(unitCost) || 0),
    [quantity, unitCost],
  );
  const today = todayIST();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const payload = {
      ...Object.fromEntries(new FormData(event.currentTarget).entries()),
      productId: product.id,
      quantity,
      unitCost,
      consumptions: consumptions.filter(
        (item) => item.productId && Number(item.quantity) > 0,
      ),
    };
    try {
      const response = await companyFetch("/api/restocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Could not save the restock.");
      window.location.href = `/products/${product.id}?restocked=1`;
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save the restock.",
      );
    }
  }

  return (
    <form className="customer-form restock-form" onSubmit={submit}>
      <div className="restock-heading">
        <div>
          <span>
            {product.itemType === "manufactured_product"
              ? "Production run"
              : "Inventory receipt"}
          </span>
          <h1>
            {product.itemType === "manufactured_product"
              ? "Produce & restock"
              : "Restock"}
          </h1>
          <p>
            {product.name}
            {product.sku ? ` · ${product.sku}` : ""}
          </p>
        </div>
        <div className="stock-balance">
          <span>Available now</span>
          <strong>
            {qty(product.currentStockMilli)} {product.unit}
          </strong>
        </div>
      </div>
      <fieldset className="form-section">
        <legend>Purchase details</legend>
        <div className="form-grid">
          <label>
            <span>
              {product.itemType === "manufactured_product"
                ? "Quantity produced *"
                : "Quantity received *"}
            </span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              required
              autoFocus
            />
          </label>
          <label>
            <span>Unit</span>
            <input value={product.unit} readOnly aria-readonly="true" />
          </label>
          <label>
            <span>Unit cost (₹) *</span>
            <input
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              name="unitCost"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </label>
          <label>
            <span>Purchase date *</span>
            <input
              name="movementDate"
              type="date"
              defaultValue={today}
              required
            />
          </label>
          <label>
            <span>Supplier</span>
            <input
              name="supplier"
              defaultValue={product.supplier || ""}
              maxLength={160}
              placeholder="Supplier or vendor name"
            />
          </label>
          <label>
            <span>Supplier invoice / reference</span>
            <input
              name="reference"
              maxLength={100}
              placeholder="e.g. PO-2026-1042"
            />
          </label>
          <label className="wide-field">
            <span>Notes</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Batch, warehouse, receiving condition, or other notes"
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="form-section">
        <div className="section-heading">
          <h2>Raw materials consumed</h2>
          <button
            className="line-add"
            type="button"
            onClick={() =>
              setConsumptions((current) => [
                ...current,
                { productId: "", quantity: "" },
              ])
            }
          >
            <Plus /> Add material
          </button>
        </div>
        <p className="form-help">
          Optional for resale stock. For manufactured products, each saved
          quantity is deducted automatically from raw-material balance.
        </p>
        {consumptions.length === 0 ? (
          <div className="empty-transactions compact-empty">
            No materials selected.
          </div>
        ) : (
          <div className="consumption-lines">
            {consumptions.map((item, index) => {
              const material = materials.find(
                (entry) => entry.id === item.productId,
              );
              return (
                <div className="consumption-line" key={index}>
                  <label>
                    <span>Raw material</span>
                    <select
                      value={item.productId}
                      onChange={(event) =>
                        setConsumptions((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? { ...entry, productId: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="">Select material</option>
                      {materials.map((entry) => (
                        <option value={entry.id} key={entry.id}>
                          {entry.name} · {qty(entry.currentStockMilli)}{" "}
                          {entry.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>
                      Quantity consumed {material ? `(${material.unit})` : ""}
                    </span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) =>
                        setConsumptions((current) =>
                          current.map((entry, i) =>
                            i === index
                              ? { ...entry, quantity: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="line-remove"
                    type="button"
                    aria-label="Remove material"
                    onClick={() =>
                      setConsumptions((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="restock-summary">
        <div>
          <span>New available stock</span>
          <strong>
            {qty(
              product.currentStockMilli +
                Math.round((Number(quantity) || 0) * 1000),
            )}{" "}
            {product.unit}
          </strong>
        </div>
        <div>
          <span>Purchase value</span>
          <strong>{money(total)}</strong>
        </div>
      </div>
      <div className="form-footer">
        <div className={`form-status ${status}`} role="status">
          {message}
        </div>
        <button className="save-customer" disabled={status === "saving"}>
          {status === "saving" ? "Updating…" : "Confirm restock"}
        </button>
      </div>
    </form>
  );
}
