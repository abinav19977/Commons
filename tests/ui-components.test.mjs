import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("creates balanced books for everyday money flows", async () => {
  const { simpleEntry, isBalanced } = await vite.ssrLoadModule("/app/lib/accounting.ts");
  for (const kind of ["money_in", "money_out", "transfer"]) {
    const lines = simpleEntry(kind, 125050, { category: "business_expense" });
    assert.equal(isBalanced(lines), true);
    assert.equal(lines.reduce((sum, line) => sum + line.debitPaise, 0), 125050);
    assert.equal(lines.reduce((sum, line) => sum + line.creditPaise, 0), 125050);
  }
});

test("balances GST sales, purchases and all correction documents", async () => {
  const { salesEntry, purchaseEntry, adjustmentEntry, manualEntry, assetAcquisitionEntry, depreciationEntry, periodAdjustmentEntry, isBalanced } = await vite.ssrLoadModule("/app/lib/accounting.ts");
  assert.equal(isBalanced(salesEntry(100000, 18000)), true);
  assert.equal(isBalanced(purchaseEntry(100000, 18000)), true);
  for (const type of ["sales_return", "credit_note", "purchase_return", "debit_note"]) {
    assert.equal(isBalanced(adjustmentEntry(type, 100000, 18000)), true);
  }
  assert.equal(isBalanced(manualEntry("6000", "1010", 50000)), true);
  assert.equal(manualEntry("6000", "6000", 50000), null);
  assert.equal(isBalanced(purchaseEntry(100000,18000,true,false,false)),true);
  assert.equal(isBalanced(purchaseEntry(100000,18000,true,true,true)),true);
  assert.equal(isBalanced(assetAcquisitionEntry(500000,"1010")),true);
  assert.equal(isBalanced(depreciationEntry(10000)),true);
  for(const type of ["provision","bad_debt","income_tax"])assert.equal(isBalanced(periodAdjustmentEntry(type,25000)),true);
});

test("produces stable profit and balance-sheet totals", async () => {
  const { reportFromBalances } = await vite.ssrLoadModule("/app/lib/accounting.ts");
  const report = reportFromBalances({ "1010": 500000, "2000": 100000, "3000": 200000, "4000": 900000, "5000": 350000, "6000": 50000 });
  assert.deepEqual(report, { assets: 500000, liabilities: 100000, equity: 200000, income: 900000, expenses: 400000, profit: 500000 });
});

test("reports fixed assets, contra assets, provisions and year-end balances",async()=>{
 const {reportFromBalances}=await vite.ssrLoadModule("/app/lib/accounting.ts");
 assert.deepEqual(reportFromBalances({"1500":1000000,"1510":200000,"1520":50000,"2300":60000,"2310":40000,"3200":300000,"6200":200000,"6300":50000,"6400":40000}),{assets:750000,liabilities:100000,equity:300000,income:0,expenses:290000,profit:-290000});
});

test("bookkeeping rejects unsafe precision, negative values and two-sided lines",async()=>{
 const {isBalanced}=await vite.ssrLoadModule("/app/lib/accounting.ts");
 for(const amount of [Infinity,NaN,0.1,Number.MAX_SAFE_INTEGER+1,-1])assert.equal(isBalanced([{debitPaise:amount,creditPaise:0},{debitPaise:0,creditPaise:amount}]),false);
 assert.equal(isBalanced([{debitPaise:100,creditPaise:100}]),false);
});
