import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

test("removed File Organiser is absent from routes, navigation and tests", () => {
  assert.equal(existsSync("app/tools/files/page.tsx"), false);
  assert.equal(existsSync("app/tools/files/organise.mjs"), false);
  assert.doesNotMatch(readFileSync("app/workspace/page.tsx", "utf8"), /File organiser|href=\"\/tools\"/i);
});

test("Help covers the complete non-accounting workflow and Tally safety", () => {
  const help = readFileSync("app/help/page.tsx", "utf8");
  for (const phrase of ["first 15-minute setup", "Order is not receipt", "Manual entry is allowed", "TallyPrime live sync", "Ask Commons Copilot", "When something does not look right"]) assert.match(help, new RegExp(phrase, "i"));
});

test("Copilot verifies keys through Responses API with timeout and confirmation guard", () => {
  const route = readFileSync("app/api/assistant/route.ts", "utf8");
  const settings = readFileSync("app/settings/api-settings.tsx", "utf8");
  const assistant = readFileSync("app/components/commons-assistant.tsx", "utf8");
  assert.match(route, /api\.openai\.com\/v1\/responses/);
  assert.match(route, /AbortSignal\.timeout/);
  assert.match(settings, /Checking the connection/);
  assert.match(settings, /Connection verified/);
  assert.match(assistant, /approve every financial change/i);
});

test("empty accounting controls do not invent audit or inventory records", () => {
  assert.doesNotMatch(readFileSync("app/accounts/controls/page.tsx", "utf8"), /demo-audit/);
  assert.doesNotMatch(readFileSync("app/accounts/inventory/page.tsx", "utf8"), /demo-batch|demo-rice|demo-main/);
});
