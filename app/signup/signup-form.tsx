"use client";
import { FormEvent, useState } from "react";
export default function SignupForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [fullName, setFullName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, fullName }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      window.location.assign(returnTo);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create your account."); setBusy(false); }
  }
  return <form className="plain-book-form" onSubmit={submit}>
    <label><span>Full name</span><input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
    <label><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label><span>Password</span><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="submit-button" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    <p>Already have an account? <a href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</a></p>
  </form>;
}
