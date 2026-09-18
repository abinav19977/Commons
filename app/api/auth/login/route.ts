import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { verifyPassword } from "../../../lib/password";
import { createSession, setSessionCookie } from "../../../session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ message: "Please open this form in Commons." }, { status: 403 });

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });

  const { email, password } = parsed.data;
  const account = await getRawDb().prepare("SELECT id, password_hash AS passwordHash FROM accounts WHERE email=?")
    .bind(email).first<{ id: string; passwordHash: string }>();
  if (!account || !(await verifyPassword(password, account.passwordHash)))
    return NextResponse.json({ message: "Incorrect email or password." }, { status: 401 });

  const { token, expiresAt } = await createSession(account.id);
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token, expiresAt);
  return response;
}
