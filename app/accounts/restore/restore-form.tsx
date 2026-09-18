"use client";
import { FormEvent, useEffect, useState } from "react";
import { companyFetch } from "@/app/company-fetch";

type Snapshot = { id: string; requested_by: string; record_count: number; note: string | null; created_at: number };

export default function RestoreForm() {
  const [backup, setBackup] = useState<unknown>(), [confirmation, setConfirmation] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotConfirmations, setSnapshotConfirmations] = useState<Record<string, string>>({});

  useEffect(() => {
    companyFetch("/api/accounts/restore").then((r) => r.ok ? r.json() : null).then((body) => body?.snapshots && setSnapshots(body.snapshots)).catch(() => {});
  }, []);

  async function pick(file?: File) {
    setError(""); setMessage("");
    if (!file) return;
    try { setBackup(JSON.parse(await file.text())); setMessage("File loaded. Verify it before restoring."); }
    catch { setError("Choose an unmodified Commons JSON backup."); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!backup) return setError("Choose a backup file first.");
    setBusy(true); setError("");
    const response = await companyFetch("/api/accounts/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ backup, confirmation }) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setError(body.message || "Restore could not be completed.");
    setMessage(body.message + (body.rowCount ? ` ${body.rowCount} records checked.` : ""));
  }

  async function restoreSnapshot(id: string) {
    setError(""); setMessage("");
    const confirmationText = snapshotConfirmations[id] || "";
    const response = await companyFetch("/api/accounts/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotId: id, confirmation: confirmationText }) });
    const body = await response.json();
    if (!response.ok) return setError(body.message || "Snapshot could not be restored.");
    setMessage(body.message + (body.rowCount ? ` ${body.rowCount} records checked.` : ""));
  }

  return (
    <>
      <form className="plain-book-form" onSubmit={submit}>
        <label><span>Commons backup file</span><input type="file" accept="application/json,.json" onChange={(event) => pick(event.target.files?.[0])} /></label>
        <p className="control-warning">Restoring into an empty company only needs verification. Restoring into a company that already has data requires a stronger confirmation below, and Commons automatically saves a safety snapshot of the current data first, so it can be undone.</p>
        <label><span>Confirmation</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="First verify; then type the phrase Commons shows you" /></label>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        <button className="submit-button" disabled={busy}>{busy ? "Working…" : "Verify or restore backup"}</button>
      </form>
      {snapshots.length > 0 && (
        <div className="plain-book-form" style={{ marginTop: 24 }}>
          <h3>Recent safety snapshots</h3>
          <p className="control-warning">Automatically saved right before an overwrite restore. Restoring one replaces everything currently in this company with that earlier state.</p>
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="detail-item" style={{ marginBottom: 12 }}>
              <dt>{new Date(snapshot.created_at).toLocaleString()} · {snapshot.record_count} records</dt>
              <dd style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input placeholder="Type the phrase Commons shows you to restore" value={snapshotConfirmations[snapshot.id] || ""} onChange={(event) => setSnapshotConfirmations({ ...snapshotConfirmations, [snapshot.id]: event.target.value })} />
                <button type="button" className="submit-button" onClick={() => restoreSnapshot(snapshot.id)}>Restore this</button>
              </dd>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
