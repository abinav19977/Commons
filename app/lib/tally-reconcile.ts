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
