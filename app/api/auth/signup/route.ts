import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { hashPassword } from "../../../lib/password";
import { createSession, setSessionCookie } from "../../../session";

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ message: "Please open this form in Commons." }, { status: 403 });

  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check your email and password." },
      { status: 400 },
    );

  const { email, password, fullName } = parsed.data;
  const existing = await getRawDb().prepare("SELECT id FROM accounts WHERE email=?").bind(email).first();
  if (existing) return NextResponse.json({ message: "An account with that email already exists." }, { status: 409 });

  const id = crypto.randomUUID();
  await getRawDb().prepare(
    "INSERT INTO accounts (id,email,password_hash,full_name,created_at) VALUES (?,?,?,?,?)",
  ).bind(id, email, await hashPassword(password), fullName || null, Date.now()).run();

  const { token, expiresAt } = await createSession(id);
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token, expiresAt);
  return response;
}
