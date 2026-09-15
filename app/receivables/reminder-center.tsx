"use client";
import { companyFetch } from "@/app/company-fetch";

import { FormEvent, useMemo, useState } from "react";
import { Mail, MessageCircle, Save } from "lucide-react";
import type {
  ReceivableReminder,
  ReceivableSettingsView,
} from "./receivables-data";

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

function messageFor(item: ReceivableReminder, template: string) {
  return template
    .replaceAll("{customer}", item.customerName)
    .replaceAll("{amount}", money(item.outstandingPaise))
    .replaceAll("{invoice_count}", String(item.invoiceCount))
    .replaceAll("{oldest_due_date}", item.oldestDueDate);
}

export default function ReminderCenter({
  initialSettings,
  reminders,
}: {
  initialSettings: ReceivableSettingsView;
  reminders: ReceivableReminder[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const total = useMemo(
    () => reminders.reduce((sum, item) => sum + item.outstandingPaise, 0),
    [reminders],
  );

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await companyFetch("/api/receivables/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overdueDays: settings.overdueDays,
          minimumOutstanding: settings.minimumOutstandingPaise / 100,
          preferredChannel: settings.preferredChannel,
          messageTemplate: settings.messageTemplate,
          enabled: settings.enabled,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not save reminder rules.");
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save reminder rules.");
    }
  }

  function openReminder(item: ReceivableReminder, channel: "whatsapp" | "email") {
    const reminderMessage = messageFor(item, settings.messageTemplate);
    void companyFetch("/api/receivables/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        customerId: item.customerId,
        customerName: item.customerName,
        channel,
        outstandingPaise: item.outstandingPaise,
        message: reminderMessage,
      }),
    });
    if (channel === "whatsapp") {
      const digits = item.primaryPhone.replace(/\D/g, "");
      const phone = digits.length === 10 ? `91${digits}` : digits;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderMessage)}`, "_blank", "noopener,noreferrer");
    } else {
      const subject = `Payment reminder · ${item.invoiceNumbers.join(", ")}`;
      window.open(
        `mailto:${item.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reminderMessage)}`,
        "_self",
      );
    }
  }

  return (
    <>
      <div className="receivable-summary">
        <div><span>Customers requiring follow-up</span><strong>{reminders.length}</strong></div>
        <div><span>Overdue value</span><strong>{money(total)}</strong></div>
        <div><span>Trigger</span><strong>{settings.overdueDays}+ days</strong></div>
      </div>

      <div className="receivable-layout">
        <section className="receivable-queue" aria-labelledby="reminder-queue-title">
          <div className="section-heading">
            <h2 id="reminder-queue-title">Reminder queue</h2>
            <span>{reminders.length.toString().padStart(2, "0")}</span>
          </div>
          <p className="form-help">Messages open prefilled for your review before sending.</p>
          {reminders.length ? reminders.map((item) => (
            <article className="receivable-card" key={`${item.customerId}:${item.customerName}`}>
              <div className="receivable-card-head">
                <div>
                  <strong>{item.customerName}</strong>
                  <span>{item.invoiceNumbers.join(", ")} · {item.daysOverdue} days overdue</span>
                </div>
                <strong>{money(item.outstandingPaise)}</strong>
              </div>
              <p>{messageFor(item, settings.messageTemplate)}</p>
              {item.lastReminderAt && (
                <small>Last opened {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(item.lastReminderAt))}</small>
              )}
              <div className="receivable-actions">
                {settings.preferredChannel !== "email" && (
                  <button
                    type="button"
                    disabled={!item.primaryPhone}
                    onClick={() => openReminder(item, "whatsapp")}
                  >
                    <MessageCircle /> WhatsApp
                  </button>
                )}
                {settings.preferredChannel !== "whatsapp" && (
                  <button
                    type="button"
                    disabled={!item.email}
                    onClick={() => openReminder(item, "email")}
                  >
                    <Mail /> Email
                  </button>
                )}
              </div>
            </article>
          )) : <div className="empty-transactions">No customer currently crosses the reminder rule.</div>}
        </section>

        <form className="reminder-settings" onSubmit={saveSettings}>
          <span className="panel-kicker">Automation rules</span>
          <h2>Reminder threshold</h2>
          <label>
            <span>Days after due date</span>
            <input
              type="number"
              min="0"
              max="3650"
              value={settings.overdueDays}
              onChange={(event) => setSettings({ ...settings, overdueDays: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Minimum outstanding ₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.minimumOutstandingPaise / 100}
              onChange={(event) => setSettings({ ...settings, minimumOutstandingPaise: Math.round(Number(event.target.value) * 100) })}
            />
          </label>
          <label>
            <span>Preferred channel</span>
            <select
              value={settings.preferredChannel}
              onChange={(event) => setSettings({ ...settings, preferredChannel: event.target.value as ReceivableSettingsView["preferredChannel"] })}
            >
              <option value="both">WhatsApp + email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label>
            <span>Message template</span>
            <textarea
              rows={7}
              value={settings.messageTemplate}
              onChange={(event) => setSettings({ ...settings, messageTemplate: event.target.value })}
            />
          </label>
          <p className="template-help">Available: {"{customer}"}, {"{amount}"}, {"{invoice_count}"}, {"{oldest_due_date}"}</p>
          <label className="check-field">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            <span>Enable reminder detection</span>
          </label>
          <div className={`form-status ${status}`} role="status">{message}</div>
          <button className="dashboard-primary reminder-save" disabled={status === "saving"}>
            <Save /> {status === "saving" ? "Saving…" : "Save rules"}
          </button>
        </form>
      </div>
    </>
  );
}
