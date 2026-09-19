"use client";
export type TransferJob = {
  title: string; total: number; done: number; imported: number; held: number; already: number;
  startedAt: number; finished: boolean; stopping: boolean; error?: string;
};

export function durationText(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "calculating…";
  if (seconds < 45) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `about ${hours} h${rest ? ` ${rest} min` : ""}`;
}

// Rate and ETA come from the whole run so far (not the last batch), so one slow batch doesn't make
// the estimate jump around. Nothing is estimated until there is something to measure.
export function progressStats(job: Pick<TransferJob, "total" | "done" | "startedAt">, now: number) {
  const elapsed = Math.max(0, (now - job.startedAt) / 1000);
  const percent = job.total > 0 ? Math.min(100, Math.floor((job.done / job.total) * 100)) : 0;
  const perSecond = elapsed > 2 && job.done > 0 ? job.done / elapsed : 0;
  const remaining = Math.max(0, job.total - job.done);
  return { elapsed, percent, perSecond, eta: perSecond > 0 ? remaining / perSecond : NaN };
}

export default function ProgressWindow({ job, now, onStop, onClose }: { job: TransferJob; now: number; onStop: () => void; onClose: () => void }) {
  const s = progressStats(job, now);
  const rate = s.perSecond ? (s.perSecond >= 1 ? `${s.perSecond.toFixed(1)}/sec` : `${Math.round(s.perSecond * 60)}/min`) : "—";
  return (
    <div className="progress-window" role="dialog" aria-live="polite" aria-label={job.title}>
      <div className="progress-head"><strong>{job.finished ? (job.error ? "Stopped" : "Done") : job.stopping ? "Stopping after this batch…" : job.title}</strong>
        {job.finished && <button type="button" onClick={onClose} aria-label="Close">Close</button>}</div>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.finished && !job.error ? 100 : s.percent}>
        <div className="progress-fill" style={{ width: `${job.finished && !job.error ? 100 : s.percent}%` }} />
      </div>
      <p className="progress-line"><b>{job.done.toLocaleString("en-IN")}</b> of {job.total.toLocaleString("en-IN")} · {job.finished && !job.error ? 100 : s.percent}%</p>
      {!job.finished && <p className="progress-line">{durationText(s.eta)} left · {rate} · {s.elapsed < 60 ? `${Math.round(s.elapsed)} sec` : `${Math.floor(s.elapsed / 60)} min ${Math.round(s.elapsed % 60)} sec`} so far</p>}
      <p className="progress-counts"><span>{job.imported.toLocaleString("en-IN")} imported</span><span>{job.already.toLocaleString("en-IN")} already up to date</span><span>{job.held.toLocaleString("en-IN")} held for review</span></p>
      {job.error && <p className="form-error">{job.error}</p>}
      {!job.finished && !job.stopping && <button type="button" onClick={onStop}>Stop after this batch</button>}
    </div>
  );
}
