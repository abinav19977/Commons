import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, clearSessionCookie, SESSION_COOKIE } from "../session";

export async function GET(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);

  const returnTo = new URL(request.url).searchParams.get("return_to");
  const response = NextResponse.redirect(new URL(returnTo?.startsWith("/") ? returnTo : "/", request.url));
  clearSessionCookie(response);
  return response;
}
