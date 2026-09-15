"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { companyFetch } from "../company-fetch";

const storageKey = "commons.llm.session";

export default function ApiSettings() {
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer=setTimeout(()=>{try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;
      const value = JSON.parse(saved) as { provider?: string; apiKey?: string };
      if (value.apiKey) {setProvider(value.provider || "openai");setApiKey(value.apiKey);setConnected(true);}
    } catch { sessionStorage.removeItem(storageKey); }},0);
    return ()=>clearTimeout(timer);
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (apiKey.trim().length < 20) { setMessage("Enter a valid API key."); return; }
    setMessage("Checking the connection…");
    try{
      const response=await companyFetch("/api/assistant",{method:"POST",headers:{"content-type":"application/json","x-commons-ai-key":apiKey.trim()},body:JSON.stringify({question:"Reply only with: Connection verified.",context:"settings"})});
      const body=await response.json().catch(()=>({})) as {answer?:string;message?:string};
      if(!response.ok){setConnected(false);setMessage(body.message||"The key could not be verified.");return}
      sessionStorage.setItem(storageKey, JSON.stringify({ provider, apiKey: apiKey.trim() }));
      setConnected(true); setMessage("Connection verified for this browser session. Commons Copilot can answer open-ended questions.");
    }catch{setConnected(false);setMessage("Commons could not reach OpenAI. Check your connection and try again.")}
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
    <p className="professional-note">Use a project API key from your OpenAI API account. A ChatGPT subscription alone does not supply an API key. Copilot can explain and prepare workflows; financial entries, reminders and filings still require your confirmation.</p>
  </section>;
}
