// Ledger-by-ledger comparison with Tally, and the opening-balance entry that makes Commons start
// from the same place Tally does. All amounts are paise and CREDIT-POSITIVE (Tally writes debits
// as negative numbers), which is also how imported voucher ledgers are stored.
import type { BookLine } from "./accounting";

export type MasterLedger = { name: string; group: string | null; opening: number | null; closing: number | null };
export type VoucherLedger = { name: string; amount: number };
export type Difference = { name: string; group: string | null; tally: number; commons: number; diff: number };

const keyOf = (name: string) => name.toLowerCase().trim();

export function reconcileLedgers(masters: MasterLedger[], vouchers: VoucherLedger[], openingsPosted: boolean) {
  const moved = new Map<string, number>();
  for (const l of vouchers) moved.set(keyOf(l.name), (moved.get(keyOf(l.name)) || 0) + l.amount);
  const rows: Difference[] = [];
  let matched = 0, checked = 0;
  for (const m of masters) {
    if (m.closing === null) continue;
    checked++;
    const commons = (openingsPosted ? m.opening || 0 : 0) + (moved.get(keyOf(m.name)) || 0);
    const diff = m.closing - commons;
    if (diff === 0) matched++;
    else rows.push({ name: m.name, group: m.group, tally: m.closing, commons, diff });
  }
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return { checked, matched, differing: rows.length, rows, totalAbsDifference: rows.reduce((s, r) => s + Math.abs(r.diff), 0) };
}

export type OpeningPlan = { lines: BookLine[]; ledgers: number; unmapped: { name: string; amount: number }[]; balancingPaise: number };

// `resolve` returns the Commons account for a ledger (and party details for debtors/creditors).
export function openingEntry(
  masters: MasterLedger[],
  resolve: (name: string, group: string | null) => { code: string; name: string; party?: { type: "customer" | "supplier"; id: string; name: string } } | undefined,
): OpeningPlan {
  const merged = new Map<string, BookLine & { key: string }>();
  const unmapped: { name: string; amount: number }[] = [];
  let ledgers = 0, net = 0;
  const add = (code: string, accountName: string, amount: number, party?: { type: "customer" | "supplier"; id: string; name: string }) => {
    const key = `${code}|${party?.id || ""}`;
    const line = merged.get(key) || { key, accountCode: code, accountName, debitPaise: 0, creditPaise: 0, ...(party ? { partyType: party.type, partyId: party.id, partyName: party.name } : {}) };
    if (amount > 0) line.creditPaise += amount; else line.debitPaise += -amount;
    merged.set(key, line);
  };
  for (const m of masters) {
    const amount = m.opening || 0;
    if (!amount) continue;
    ledgers++; net += amount;
    const target = resolve(m.name, m.group);
    if (target) add(target.code, target.name, amount, target.party);
    else { unmapped.push({ name: m.name, amount }); add("3100", "Opening balance equity", amount); }
  }
  // Tally's openings balance among themselves; anything left over (a ledger we skipped, or rounding)
  // is parked in Opening balance equity so the entry always balances.
  const lines = [...merged.values()].map(({ key: _key, ...line }) => line).filter((l) => l.debitPaise || l.creditPaise);
  const debit = lines.reduce((s, l) => s + l.debitPaise, 0), credit = lines.reduce((s, l) => s + l.creditPaise, 0);
  const balancingPaise = debit - credit;
  if (balancingPaise) lines.push(balancingPaise > 0 ? { accountCode: "3100", accountName: "Opening balance equity", debitPaise: 0, creditPaise: balancingPaise } : { accountCode: "3100", accountName: "Opening balance equity", debitPaise: -balancingPaise, creditPaise: 0 });
  return { lines, ledgers, unmapped, balancingPaise };
}

// Groups whose ledgers start each financial year at zero (income and expense accounts).
const PROFIT_AND_LOSS_GROUPS = new Set(["sales accounts", "purchase accounts", "direct incomes", "indirect incomes", "direct expenses", "indirect expenses"]);
export const isProfitAndLoss = (group: string | null) => PROFIT_AND_LOSS_GROUPS.has((group || "").toLowerCase().trim());

// Tally's closing balance already contains everything that ever happened to a ledger, so its opening
// balance is whatever is left after taking off the vouchers Commons has imported:
//   opening = closing - movement.
// This needs no slow per-ledger opening-balance request to Tally and is exact by construction.
// An income or expense ledger should come out at zero; a non-zero result means Tally has activity
// Commons doesn't (typically vouchers still held back), so those are returned for the owner to see.
export function deriveOpenings(masters: MasterLedger[], vouchers: VoucherLedger[]) {
  const moved = new Map<string, number>();
  for (const l of vouchers) moved.set(keyOf(l.name), (moved.get(keyOf(l.name)) || 0) + l.amount);
  const unexplained: { name: string; amount: number }[] = [];
  const derived = masters.map((m) => {
    if (m.closing === null) return m;
    const opening = m.closing - (moved.get(keyOf(m.name)) || 0);
    if (opening !== 0 && isProfitAndLoss(m.group)) unexplained.push({ name: m.name, amount: opening });
    return { ...m, opening };
  });
  unexplained.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return { masters: derived, unexplained, unexplainedTotal: unexplained.reduce((s, r) => s + Math.abs(r.amount), 0) };
}
