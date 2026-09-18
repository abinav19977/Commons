import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { webcrypto } from "node:crypto";

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const f of fs.readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) db.exec(fs.readFileSync("drizzle/" + f, "utf8"));
  const raw = { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return { meta: db.prepare(sql).run(...args) }; } }; } };
  const cookieJar = new Map();
  const cookies = { set(key, value, opts) { if (opts && opts.maxAge === 0) cookieJar.delete(key); else cookieJar.set(key, value); } };
  const cache = {};
  function load(file) {
    file = path.resolve(file);
    if (cache[file]) return cache[file];
    const exports = {};
    cache[file] = exports;
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, Error, TextEncoder, TextDecoder, Request, Response, URL, Date, btoa, atob, crypto: webcrypto,
      require(name) {
        if (name === "zod") return { z };
        if (name === "next/server") return { NextResponse: { json(data, options) { return { data, status: options?.status || 200, cookies }; }, redirect(url) { return { status: 307, headers: { get: (h) => (h === "location" ? String(url) : null) }, cookies }; } } };
        if (name === "next/headers") return { cookies: async () => ({ get: (key) => (cookieJar.has(key) ? { value: cookieJar.get(key) } : undefined) }) };
        if (name === "next/navigation") return { redirect: (p) => { throw Error("redirect:" + p); } };
        if (name.endsWith("/db")) return { getRawDb: () => raw };
        return load(path.resolve(path.dirname(file), name) + ".ts");
      },
    });
    return exports;
  }
  const signup = load("app/api/auth/signup/route.ts");
  const login = load("app/api/auth/login/route.ts");
  const logout = load("app/logout/route.ts");
  const auth = load("app/chatgpt-auth.ts");
  const request = (url, { body } = {}) => new Request(url, { method: "POST", headers: { "content-type": "application/json", origin: "https://commons.test" }, body: JSON.stringify(body) });
  return { db, cookieJar, signup, login, logout, auth, request };
}

test("signup creates an account and a working session", async () => {
  const s = setup();
  const response = await s.signup.POST(s.request("https://commons.test/api/auth/signup", { body: { email: "New.User@Example.com", password: "correct horse battery" } }));
  assert.equal(response.status, 200);
  assert.ok(s.cookieJar.get("commons-session"));
  const user = await s.auth.getChatGPTUser();
  assert.equal(user.email, "new.user@example.com");
});

test("duplicate signup is rejected", async () => {
  const s = setup();
  await s.signup.POST(s.request("https://commons.test/api/auth/signup", { body: { email: "dup@example.com", password: "correct horse battery" } }));
  const response = await s.signup.POST(s.request("https://commons.test/api/auth/signup", { body: { email: "dup@example.com", password: "another password" } }));
  assert.equal(response.status, 409);
});

test("login with the correct password succeeds and the wrong password is rejected", async () => {
  const s = setup();
  await s.signup.POST(s.request("https://commons.test/api/auth/signup", { body: { email: "owner@example.com", password: "correct horse battery" } }));
  s.cookieJar.clear();

  const wrong = await s.login.POST(s.request("https://commons.test/api/auth/login", { body: { email: "owner@example.com", password: "wrong password" } }));
  assert.equal(wrong.status, 401);
  assert.equal(s.cookieJar.get("commons-session"), undefined);
  assert.equal(await s.auth.getChatGPTUser(), null);

  const right = await s.login.POST(s.request("https://commons.test/api/auth/login", { body: { email: "owner@example.com", password: "correct horse battery" } }));
  assert.equal(right.status, 200);
  assert.ok(s.cookieJar.get("commons-session"));
  assert.equal((await s.auth.getChatGPTUser()).email, "owner@example.com");
});

test("logout invalidates the session", async () => {
  const s = setup();
  await s.signup.POST(s.request("https://commons.test/api/auth/signup", { body: { email: "leaving@example.com", password: "correct horse battery" } }));
  assert.ok(await s.auth.getChatGPTUser());

  await s.logout.GET(new Request("https://commons.test/logout"));
  assert.equal(s.cookieJar.get("commons-session"), undefined);
  assert.equal(await s.auth.getChatGPTUser(), null);
});

test("password hashing stays within Cloudflare Workers' PBKDF2 iteration cap", async () => {
  const s = setup();
  await s.signup.POST(s.request("https://commons.test/api/auth/signup", { body: { email: "capped@example.com", password: "correct horse battery" } }));
  const row = s.db.prepare("SELECT password_hash FROM accounts WHERE email=?").get("capped@example.com");
  const iterations = Number(row.password_hash.split(":")[0]);
  // Workers' SubtleCrypto rejects PBKDF2 above 100,000 iterations at runtime;
  // Node's WebCrypto (used by this test) has no such cap, so this assertion
  // is the only thing that would catch a regression here.
  assert.ok(iterations <= 100_000, `iterations ${iterations} exceed the Workers PBKDF2 cap`);
});
