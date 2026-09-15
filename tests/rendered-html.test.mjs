import assert from "node:assert/strict";
import test from "node:test";

test("build exports a Cloudflare Worker with a fetch handler", async () => {
  const bundle = await import("node:fs/promises").then(({readFile}) => readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"));
  assert.match(bundle, /var worker_entry_default = \{ async fetch\(/);
  assert.match(bundle, /export \{ worker_entry_default as default \}/);
});
