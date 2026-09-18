// Commons is an India-only app: every statutory date (invoice date, GST period, purchase
// date, report range) must use the Indian calendar day, not the server/browser's UTC day.
// `new Date().toISOString()` is always UTC, which is a day behind IST for roughly 5.5
// hours every evening (18:30-23:59 UTC = 00:00-05:29 IST) — exactly the window a shop
// owner is most likely to be billing in. This holds for both client and server (Cloudflare
// Workers run in UTC too), so the same helper is safe in both contexts.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export function todayIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
// Same IST-calendar-day fix as todayIST(), for callers computing an overdue/cutoff date
// relative to "now" rather than literally today.
export function daysAgoIST(days: number): string {
  return new Date(Date.now() + IST_OFFSET_MS - days * 86400000).toISOString().slice(0, 10);
}
