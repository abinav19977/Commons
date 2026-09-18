import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import * as drizzleOrm from "drizzle-orm";
import * as sqliteCore from "drizzle-orm/sqlite-core";

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const f of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) db.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  const raw = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return /^\s*SELECT/i.test(sql) ? { results: db.prepare(sql).all(...args), meta: { changes: 0 } } : { meta: db.prepare(sql).run(...args) }; },
        // drizzle-orm's D1 driver reads SELECT results via .raw() (array-of-arrays), not .all().
        raw(opts) {
          const rows = db.prepare(sql).all(...args);
          const values = rows.map((row) => Object.values(row));
          return opts?.columnNames ? [rows[0] ? Object.keys(rows[0]) : [], ...values] : values;
        },
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec("COMMIT"); return results; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
  const cache = {};
  let schemaModule;
  function load(file) {
    file = path.resolve(file);
    if (cache[file]) return cache[file];
    const exports = {};
    cache[file] = exports;
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      {
        exports, Error, TextEncoder, TextDecoder, Request, Response, URL, Date, crypto: webcrypto, drizzle,
        require(name) {
          if (name === "zod") return { z };
          if (name === "drizzle-orm") return drizzleOrm;
          if (name === "drizzle-orm/sqlite-core") return sqliteCore;
          if (name === "drizzle-orm/d1") return { drizzle };
          if (name === "next/server") {
            class NextResponse {
              constructor(body, init) { this.data = body; this.status = init?.status || 200; this.cookies = { set() {} }; }
              static json(data, opts) { return { data, status: opts?.status || 200, cookies: { set() {} } }; }
            }
            return { NextResponse };
          }
          if (name.endsWith("/company-auth")) return { getChatGPTUser: async () => state.user };
          if (name.endsWith("/db/schema")) { schemaModule = schemaModule || load("db/schema.ts"); return schemaModule; }
          if (name.endsWith("/db")) return { getRawDb: () => raw, getDb: () => drizzle(raw, { schema: schemaModule || (schemaModule = load("db/schema.ts")) }) };
          return load(path.resolve(path.dirname(file), name) + ".ts");
        },
      },
    );
    return exports;
  }
  const state = { user: { id: "company-one", email: "owner@example.test", role: "owner" } };
  return { db, raw, load, state };
}

function seedCustomer(db, id = "cust-1", ownerId = "company-one") {
  db.prepare("INSERT INTO customers (id,owner_user_id,display_name,primary_phone,customer_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run(id, ownerId, "Kings Ice Cube", "9000000000", "business", 1, 1);
}
function seedSupplier(db, id = "supp-1", ownerId = "company-one") {
  db.prepare("INSERT INTO suppliers (id,owner_user_id,name,primary_phone,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id, ownerId, "Reliance Traders", "9000000001", 1, 1);
}

// --- Fix 1: adjustments/entries now attach a real partyId to their AR/AP journal lines ---
test("a credit note against a real customer posts a journal line with that customer's partyId", async () => {
  const s = setup();
  seedCustomer(s.db);
  const route = s.load("app/api/accounts/adjustments/route.ts");
  const response = await route.POST(new Request("https://commons.test/api/accounts/adjustments", {
    method: "POST",
    body: JSON.stringify({ documentType: "credit_note", documentDate: "2026-09-09", partyName: "Kings Ice Cube", customerId: "cust-1", taxableAmount: "100", gstAmount: "18", reason: "Damaged goods" }),
  }));
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const line = s.db.prepare("SELECT party_id,party_type FROM journal_lines WHERE account_code='1100' AND owner_user_id='company-one' ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(line.party_id, "cust-1");
  assert.equal(line.party_type, "customer");
});

test("adjustments reject an unknown customerId instead of silently posting with no party link", async () => {
  const s = setup();
  const route = s.load("app/api/accounts/adjustments/route.ts");
  const response = await route.POST(new Request("https://commons.test/api/accounts/adjustments", {
    method: "POST",
    body: JSON.stringify({ documentType: "credit_note", documentDate: "2026-09-09", partyName: "Ghost Customer", customerId: "does-not-exist", taxableAmount: "100", gstAmount: "0", reason: "Test" }),
  }));
  assert.equal(response.status, 400);
});

test("a manual adjustment journal entry against a supplier carries the supplier's partyId", async () => {
  const s = setup();
  seedSupplier(s.db);
  const route = s.load("app/api/accounts/entries/route.ts");
  const response = await route.POST(new Request("https://commons.test/api/accounts/entries", {
    method: "POST",
    body: JSON.stringify({ kind: "adjustment", entryDate: "2026-09-09", amount: "500", partyName: "Reliance Traders", supplierId: "supp-1", debitAccount: "2000", creditAccount: "5090" }),
  }));
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const line = s.db.prepare("SELECT party_id,party_type FROM journal_lines WHERE account_code='2000' AND owner_user_id='company-one' ORDER BY created_at DESC LIMIT 1").get();
  assert.equal(line.party_id, "supp-1");
  assert.equal(line.party_type, "supplier");
});

// --- Fix 2: dashboard revenue now comes from the ledger, matching /accounts/reports's method ---
test("business metrics revenue is the ledger's income total, not the raw invoice sum", async () => {
  const s = setup();
  const metrics = s.load("app/lib/metrics.ts");
  const today = new Date().toISOString().slice(0, 10);
  // An invoice with total 1000 but only 700 actually posted to the income ledger
  // (simulating a partial/adjusted booking) — the fixed metric must reflect the ledger, not 1000.
  s.db.prepare("INSERT INTO invoices (id,owner_user_id,invoice_number,invoice_date,customer_name,subtotal_paise,total_paise,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run("inv-1", "company-one", "INV-1", today, "Customer", 100000, 100000, "unpaid", 1);
  s.db.prepare("INSERT INTO ledger_accounts (id,owner_user_id,code,name,category,normal_side,active,created_at) VALUES (?,?,?,?,?,?,?,?)").run("la-1", "company-one", "4000", "Sales", "income", "credit", 1, 1);
  s.db.prepare("INSERT INTO journal_entries (id,owner_user_id,entry_number,entry_date,source_type,description,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run("je-1", "company-one", "SALE-1", today, "sales_invoice", "Test sale", "posted", "owner@example.test", 1);
  s.db.prepare("INSERT INTO journal_lines (id,entry_id,owner_user_id,account_code,account_name,debit_paise,credit_paise,created_at) VALUES (?,?,?,?,?,?,?,?)").run("jl-1", "je-1", "company-one", "4000", "Sales", 0, 70000, 1);
  const result = await metrics.getBusinessMetrics("company-one");
  assert.equal(result.revenuePaise, 70000);
});

// --- Fix 4: payroll and backup require owner/accountant, not just any signed-in role ---
test("payroll POST is rejected for an operator and allowed for an owner", async () => {
  const s = setup();
  const route = s.load("app/api/payroll/route.ts");
  const payload = { employeeKey: "emp-1", employeeName: "Test Employee", salaryMonth: "2026-09", baseSalary: 30000, status: "pending", paymentDate: "", paymentMode: "" };
  s.state.user = { id: "company-one", email: "op@example.test", role: "operator" };
  const denied = await route.POST(new Request("https://commons.test/api/payroll", { method: "POST", body: JSON.stringify(payload) }));
  assert.equal(denied.status, 403);
  s.state.user = { id: "company-one", email: "owner@example.test", role: "owner" };
  const allowed = await route.POST(new Request("https://commons.test/api/payroll", { method: "POST", body: JSON.stringify(payload) }));
  assert.equal(allowed.status, 201, JSON.stringify(allowed.data));
});

test("backup export is rejected for a viewer/operator and allowed for an accountant", async () => {
  const s = setup();
  const route = s.load("app/api/accounts/controls/route.ts");
  s.state.user = { id: "company-one", email: "op@example.test", role: "operator" };
  const denied = await route.GET(new Request("https://commons.test/api/accounts/controls"));
  assert.equal(denied.status, 403);
  s.state.user = { id: "company-one", email: "acct@example.test", role: "accountant" };
  const allowed = await route.GET(new Request("https://commons.test/api/accounts/controls"));
  assert.equal(allowed.status, 200);
});

// --- Fix 3: restore into a non-empty company only proceeds with the stronger phrase,
// and automatically saves a restorable snapshot of what was there before ---
test("restore into a company with existing data requires the overwrite phrase and snapshots first", async () => {
  const s = setup();
  s.db.prepare("INSERT INTO customers (id,owner_user_id,display_name,primary_phone,customer_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("existing-cust", "company-one", "Existing Co", "9000000002", "business", 1, 1);
  const route = s.load("app/api/accounts/restore/route.ts");
  const fakeBackup = { format: "commons-backup-v3", companyId: "company-one", dataSha256: "", data: { customers: [{ id: "restored-cust", owner_user_id: "company-one", display_name: "Restored Co", primary_phone: "9000000003", customer_type: "business", created_at: 1, updated_at: 1 }] } };
  const tallyBridge = s.load("app/lib/tally-bridge.ts");
  fakeBackup.dataSha256 = await tallyBridge.digest(JSON.stringify(fakeBackup.data));

  const verify = await route.POST(new Request("https://commons.test/api/accounts/restore", { method: "POST", body: JSON.stringify({ backup: fakeBackup }) }));
  assert.equal(verify.data.requiresOverwrite, true);

  const applied = await route.POST(new Request("https://commons.test/api/accounts/restore", { method: "POST", body: JSON.stringify({ backup: fakeBackup, confirmation: "REPLACE ALL COMPANY DATA" }) }));
  assert.equal(applied.status, 200, JSON.stringify(applied.data));
  assert.ok(applied.data.snapshotId);

  const remaining = s.db.prepare("SELECT id FROM customers WHERE owner_user_id='company-one'").all();
  assert.deepEqual(remaining.map((r) => r.id), ["restored-cust"]);

  const snapshot = s.db.prepare("SELECT data FROM backup_snapshots WHERE id=?").get(applied.data.snapshotId);
  assert.ok(snapshot.data.includes("Existing Co"));
});

// --- Fix 5: invoices snapshot the seller's identity at issue time ---
test("creating an invoice snapshots the business profile onto the invoice row", async () => {
  const s = setup();
  s.db.prepare("INSERT INTO business_profiles (owner_user_id,legal_name,gstin,invoice_prefix,updated_at) VALUES (?,?,?,?,?)").run("company-one", "Commons Test Pvt Ltd", "29ABCDE1234F1Z5", "INV", 1);
  const route = s.load("app/api/invoices/route.ts");
  const response = await route.POST(new Request("https://commons.test/api/invoices", {
    method: "POST",
    body: JSON.stringify({ invoiceDate: "2026-09-09", customerName: "Walk-in", supplyType: "intra_state", discount: "0", lines: [{ description: "Service", quantity: "1", unit: "PCS", rate: "100", gstRate: "0" }] }),
  }));
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const row = s.db.prepare("SELECT seller_legal_name,seller_gstin FROM invoices WHERE id=?").get(response.data.id);
  assert.equal(row.seller_legal_name, "Commons Test Pvt Ltd");
  assert.equal(row.seller_gstin, "29ABCDE1234F1Z5");
});

// --- Fix 6: GST correction posts an adjusting entry and updates the purchase's flags ---
test("correcting a purchase from ITC-eligible to ITC-ineligible posts the delta and flips the flag", async () => {
  const s = setup();
  seedSupplier(s.db);
  s.db.prepare("INSERT INTO purchases (id,owner_user_id,purchase_number,supplier_id,supplier_name,purchase_date,subtotal_paise,gst_paise,itc_eligible,reverse_charge,total_paise,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("pur-1", "company-one", "PUR-1", "supp-1", "Reliance Traders", "2026-09-09", 10000, 1800, 1, 0, 11800, "received", 1);
  const route = s.load("app/api/gst/correct/route.ts");
  const response = await route.POST(new Request("https://commons.test/api/gst/correct", {
    method: "POST",
    body: JSON.stringify({ purchaseId: "pur-1", itcEligible: false, reverseCharge: false }),
  }));
  assert.equal(response.status, 200, JSON.stringify(response.data));
  const purchase = s.db.prepare("SELECT itc_eligible FROM purchases WHERE id='pur-1'").get();
  assert.equal(purchase.itc_eligible, 0);
  const inputGstLine = s.db.prepare("SELECT debit_paise,credit_paise FROM journal_lines WHERE owner_user_id='company-one' AND account_code='1300' ORDER BY created_at DESC LIMIT 1").get();
  // Becoming ITC-ineligible means the previously-claimable input credit is reversed:
  // a credit to "Input GST credit" for the full tax amount.
  assert.equal(inputGstLine.credit_paise, 1800);
  assert.equal(inputGstLine.debit_paise, 0);
});

test("correcting a purchase with no actual change is rejected", async () => {
  const s = setup();
  seedSupplier(s.db);
  s.db.prepare("INSERT INTO purchases (id,owner_user_id,purchase_number,supplier_id,supplier_name,purchase_date,subtotal_paise,gst_paise,itc_eligible,reverse_charge,total_paise,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("pur-2", "company-one", "PUR-2", "supp-1", "Reliance Traders", "2026-09-09", 10000, 1800, 1, 0, 11800, "received", 1);
  const route = s.load("app/api/gst/correct/route.ts");
  const response = await route.POST(new Request("https://commons.test/api/gst/correct", {
    method: "POST",
    body: JSON.stringify({ purchaseId: "pur-2", itcEligible: true, reverseCharge: false }),
  }));
  assert.equal(response.status, 400);
});
