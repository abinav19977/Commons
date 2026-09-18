import { NextResponse } from "next/server";
import { getRawDb } from "../db";
import { digest } from "./lib/tally-bridge";

export const SESSION_COOKIE = "commons-session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(accountId: string): Promise<{ token: string; expiresAt: number }> {
  const token = newToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await getRawDb().prepare(`INSERT INTO account_sessions (id,account_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)`)
    .bind(crypto.randomUUID(), accountId, await digest(token), expiresAt, Date.now()).run();
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await getRawDb().prepare(`DELETE FROM account_sessions WHERE token_hash=?`).bind(await digest(token)).run();
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(expiresAt) });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}
