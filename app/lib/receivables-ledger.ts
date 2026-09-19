// What a customer really owes is their ledger balance (bills less every receipt, credit note and
// adjustment), the way Tally shows it. Summing unpaid bills alone overstates it whenever receipts
// were entered "on account" without naming a bill, so the bills are netted against the ledger
// balance oldest-first and only what is genuinely still owed is left.
export type OpenInvoice = { number: string; due: string; outstanding: number };

export function allocateBalance(balance: number, invoices: OpenInvoice[]) {
  const sorted = [...invoices].sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.number < b.number ? -1 : 1));
  if (balance <= 0) return { remaining: [] as OpenInvoice[], unattributed: 0 };
  let surplus = sorted.reduce((sum, i) => sum + i.outstanding, 0) - balance;
  const remaining: OpenInvoice[] = [];
  for (const inv of sorted) {
    const take = Math.min(inv.outstanding, Math.max(0, surplus));
    surplus -= take;
    if (inv.outstanding - take > 0) remaining.push({ ...inv, outstanding: inv.outstanding - take });
  }
  // A balance bigger than the open bills is money owed from before the bills on record (an opening balance).
  return { remaining, unattributed: Math.max(0, balance - remaining.reduce((sum, i) => sum + i.outstanding, 0)) };
}
