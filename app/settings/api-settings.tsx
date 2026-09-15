"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from "lucide-react";

const storageKey = "commons.llm.session";

export default function ApiSettings() {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;
      const value = JSON.parse(saved) as { provider?: string; apiKey?: string };
      if (value.apiKey) {
        setProvider(value.provider || "openai");
        setApiKey(value.apiKey);
        setConnected(true);
      }
    } catch { sessionStorage.removeItem(storageKey); }
  }, []);
  function save(event: FormEvent) {
    event.preventDefault();
    if (apiKey.trim().length < 20) { setMessage("Enter a valid API key."); return; }
    sessionStorage.setItem(storageKey, JSON.stringify({ provider, apiKey: apiKey.trim() }));
    setConnected(true); setMessage("Connected for this browser session. Commons Copilot can now answer open-ended questions.");
  }
  function remove() {
    sessionStorage.removeItem(storageKey); setApiKey(""); setConnected(false); setMessage("AI connection removed from this browser.");
  }
  return <section className="integration-card">
    <div className="integration-title"><KeyRound/><div><span>AI connection</span><h2>Commons Copilot</h2></div><b className={connected ? "connected" : ""}>{connected ? "Session ready" : "Not connected"}</b></div>
    <form className="plain-book-form compact" onSubmit={save}>
      <div className="form-grid"><label><span>Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="openai">OpenAI</option></select></label><label><span>API key</span><div className="secret-input"><input type={show ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" placeholder="Paste a newly created key" required/><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide key" : "Show key"}>{show ? <EyeOff/> : <Eye/>}</button></div></label></div>
      <div className="session-security"><ShieldCheck/><p><strong>Session-only connection</strong><span>The key stays in this browser session. It is sent securely only when Commons Copilot answers an open-ended question, and is never written to the database or source code.</span></p></div>
      {message && <p className={connected ? "form-success" : "form-error"}>{message}</p>}
      <div className="settings-actions"><button className="submit-button" disabled={!apiKey}>Connect Copilot</button>{connected && <button className="secondary-button" type="button" onClick={remove}><Trash2/>Remove key</button>}</div>
    </form>
    <p className="professional-note">Copilot can explain and prepare workflows. Financial entries, reminders and filings still require your confirmation; statutory work requires accountant review.</p>
  </section>;
}
