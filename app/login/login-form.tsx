"use client";
import { FormEvent, useState } from "react";
export default function LoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      window.location.assign(returnTo);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); setBusy(false); }
  }
  return <form className="plain-book-form" onSubmit={submit}>
    <label><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="submit-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    <p>New to Commons? <a href={`/signup?return_to=${encodeURIComponent(returnTo)}`}>Create an account</a></p>
  </form>;
}
