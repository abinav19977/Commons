export type BookLine = {
  accountCode: string;
  accountName: string;
  debitPaise: number;
  creditPaise: number;
  partyType?: "customer" | "supplier" | "employee";
  partyId?: string | null;
  partyName?: string | null;
};

export const CORE_ACCOUNTS = [
  { code: "1000", name: "Cash in hand", category: "asset", normalSide: "debit", systemKey: "cash" },
  { code: "1010", name: "Bank account", category: "asset", normalSide: "debit", systemKey: "bank" },
  { code: "1100", name: "Customer money due", category: "asset", normalSide: "debit", systemKey: "receivables" },
  { code: "1200", name: "Stock on hand", category: "asset", normalSide: "debit", systemKey: "inventory" },
  { code: "1300", name: "Input GST credit", category: "asset", normalSide: "debit", systemKey: "input_gst" },
  { code: "1400", name: "Supplier advances", category: "asset", normalSide: "debit", systemKey: "supplier_advances" },
  { code: "1410", name: "Employee advances", category: "asset", normalSide: "debit", systemKey: "employee_advances" },
  { code: "1420", name: "Other current assets", category: "asset", normalSide: "debit", systemKey: "other_current_assets" },
  { code: "1430", name: "TDS receivable", category: "asset", normalSide: "debit", systemKey: "tds_receivable" },
  { code: "1600", name: "Deposits and investments", category: "asset", normalSide: "debit", systemKey: "deposits_investments" },
  { code: "1500", name: "Fixed assets", category: "asset", normalSide: "debit", systemKey: "fixed_assets" },
  { code: "1510", name: "Accumulated depreciation", category: "asset", normalSide: "credit", systemKey: "accumulated_depreciation" },
  { code: "1520", name: "Allowance for doubtful accounts", category: "asset", normalSide: "credit", systemKey: "doubtful_accounts" },
  { code: "2000", name: "Supplier money due", category: "liability", normalSide: "credit", systemKey: "payables" },
  { code: "2100", name: "GST payable", category: "liability", normalSide: "credit", systemKey: "output_gst" },
  { code: "2200", name: "Customer advances", category: "liability", normalSide: "credit", systemKey: "customer_advances" },
  { code: "2210", name: "Payroll deductions payable", category: "liability", normalSide: "credit", systemKey: "payroll_deductions" },
  { code: "2300", name: "Provisions and accrued expenses", category: "liability", normalSide: "credit", systemKey: "provisions" },
  { code: "2310", name: "Income tax payable", category: "liability", normalSide: "credit", systemKey: "income_tax_payable" },
  { code: "2320", name: "TDS payable", category: "liability", normalSide: "credit", systemKey: "tds_payable" },
  { code: "2330", name: "Other current liabilities", category: "liability", normalSide: "credit", systemKey: "other_current_liabilities" },
  { code: "2400", name: "Loans payable", category: "liability", normalSide: "credit", systemKey: "loans_payable" },
  { code: "3000", name: "Owner's capital", category: "equity", normalSide: "credit", systemKey: "capital" },
  { code: "3100", name: "Opening balance equity", category: "equity", normalSide: "credit", systemKey: "opening_equity" },
  { code: "3200", name: "Retained earnings", category: "equity", normalSide: "credit", systemKey: "retained_earnings" },
  { code: "4000", name: "Sales", category: "income", normalSide: "credit", systemKey: "sales" },
  { code: "4010", name: "Other income", category: "income", normalSide: "credit", systemKey: "other_income" },
  { code: "4090", name: "Sales returned", category: "income", normalSide: "debit", systemKey: "sales_returns" },
  { code: "5000", name: "Goods purchased", category: "expense", normalSide: "debit", systemKey: "purchases" },
  { code: "5100", name: "Cost of goods sold", category: "expense", normalSide: "debit", systemKey: "cogs" },
  { code: "5090", name: "Purchases returned", category: "expense", normalSide: "credit", systemKey: "purchase_returns" },
  { code: "6000", name: "Business expenses", category: "expense", normalSide: "debit", systemKey: "expenses" },
  { code: "6100", name: "Salary expense", category: "expense", normalSide: "debit", systemKey: "salary" },
  { code: "6200", name: "Depreciation expense", category: "expense", normalSide: "debit", systemKey: "depreciation" },
  { code: "6300", name: "Provisions and bad debts", category: "expense", normalSide: "debit", systemKey: "provision_expense" },
  { code: "6400", name: "Income tax expense", category: "expense", normalSide: "debit", systemKey: "income_tax_expense" },
] as const;

export function rupeesToPaise(value: string | number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

export function isBalanced(lines: BookLine[]) {
  if(!lines.length||lines.some(line=>!Number.isSafeInteger(line.debitPaise)||!Number.isSafeInteger(line.creditPaise)||line.debitPaise<0||line.creditPaise<0||(line.debitPaise>0&&line.creditPaise>0)))return false;
  const debit = lines.reduce((sum, line) => sum + line.debitPaise, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditPaise, 0);
  return Number.isSafeInteger(debit) && Number.isSafeInteger(credit) && debit > 0 && debit === credit;
}

export function simpleEntry(
  kind: "money_in" | "money_out" | "transfer",
  amountPaise: number,
  options: { cash?: boolean; category?: string } = {},
): BookLine[] {
  const money = options.cash
    ? { accountCode: "1000", accountName: "Cash in hand" }
    : { accountCode: "1010", accountName: "Bank account" };
  if (kind === "money_in") {
    const income = options.category === "customer_payment"
      ? { accountCode: "1100", accountName: "Customer money due" }
      : { accountCode: "4010", accountName: "Other income" };
    return [
      { ...money, debitPaise: amountPaise, creditPaise: 0 },
      { ...income, debitPaise: 0, creditPaise: amountPaise },
    ];
  }
  if (kind === "money_out") {
    const cost = options.category === "supplier_payment"
      ? { accountCode: "2000", accountName: "Supplier money due" }
      : options.category === "salary"
        ? { accountCode: "6100", accountName: "Salary expense" }
        : { accountCode: "6000", accountName: "Business expenses" };
    return [
      { ...cost, debitPaise: amountPaise, creditPaise: 0 },
      { ...money, debitPaise: 0, creditPaise: amountPaise },
    ];
  }
  return [
    { accountCode: "1000", accountName: "Cash in hand", debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: "1010", accountName: "Bank account", debitPaise: 0, creditPaise: amountPaise },
  ];
}

export function manualEntry(
  debitCode: string,
  creditCode: string,
  amountPaise: number,
  accounts: ReadonlyArray<{ code: string; name: string }> = CORE_ACCOUNTS,
): BookLine[] | null {
  if (debitCode === creditCode) return null;
  const debit = accounts.find((account) => account.code === debitCode);
  const credit = accounts.find((account) => account.code === creditCode);
  if (!debit || !credit || amountPaise <= 0) return null;
  return [
    { accountCode: debit.code, accountName: debit.name, debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: credit.code, accountName: credit.name, debitPaise: 0, creditPaise: amountPaise },
  ];
}

export function salesEntry(taxablePaise: number, taxPaise: number, paid = false, costPaise = 0): BookLine[] {
  const total = taxablePaise + taxPaise;
  return [
    { accountCode: paid ? "1010" : "1100", accountName: paid ? "Bank account" : "Customer money due", debitPaise: total, creditPaise: 0 },
    { accountCode: "4000", accountName: "Sales", debitPaise: 0, creditPaise: taxablePaise },
    ...(taxPaise ? [{ accountCode: "2100", accountName: "GST payable", debitPaise: 0, creditPaise: taxPaise }] : []),
    ...(costPaise ? [
      { accountCode: "5100", accountName: "Cost of goods sold", debitPaise: costPaise, creditPaise: 0 },
      { accountCode: "1200", accountName: "Stock on hand", debitPaise: 0, creditPaise: costPaise },
    ] : []),
  ];
}

export function purchaseEntry(taxablePaise: number, taxPaise: number, inventory = true, itcEligible = true, reverseCharge = false): BookLine[] {
  const total = taxablePaise + (reverseCharge ? 0 : taxPaise);
  const assetCost = taxablePaise + (itcEligible ? 0 : taxPaise);
  return [
    { accountCode: inventory ? "1200" : "5000", accountName: inventory ? "Stock on hand" : "Goods purchased", debitPaise: assetCost, creditPaise: 0 },
    ...(taxPaise && itcEligible ? [{ accountCode: "1300", accountName: "Input GST credit", debitPaise: taxPaise, creditPaise: 0 }] : []),
    { accountCode: "2000", accountName: "Supplier money due", debitPaise: 0, creditPaise: total },
    ...(taxPaise && reverseCharge ? [{ accountCode: "2100", accountName: "GST payable", debitPaise: 0, creditPaise: taxPaise }] : []),
  ];
}

// TDS (194C/194J/194Q etc.) is deducted from what's actually paid to a supplier, not
// from the expense/GST itself — the supplier is credited the full invoice value, then
// immediately debited the TDS amount, with the same amount credited to a TDS-payable
// liability (remitted to the government, then reflected in the supplier's Form 26AS).
export function tdsDeductionEntry(tdsPaise: number): BookLine[] {
  if (!tdsPaise) return [];
  return [
    { accountCode: "2000", accountName: "Supplier money due", debitPaise: tdsPaise, creditPaise: 0 },
    { accountCode: "2320", accountName: "TDS payable", debitPaise: 0, creditPaise: tdsPaise },
  ];
}

// Corrects a purchase's GST treatment after the fact (e.g. GSTR-2B reconciliation
// reveals it should have been booked ITC-ineligible or reverse-charge). Returns just
// the delta between the original purchaseEntry() postings and the corrected ones, so
// the untouched inventory/expense value isn't re-posted, only what actually changed.
export function purchaseGstCorrectionEntry(
  taxablePaise: number,
  taxPaise: number,
  inventory: boolean,
  fromItcEligible: boolean,
  fromReverseCharge: boolean,
  toItcEligible: boolean,
  toReverseCharge: boolean,
): BookLine[] {
  const before = purchaseEntry(taxablePaise, taxPaise, inventory, fromItcEligible, fromReverseCharge);
  const after = purchaseEntry(taxablePaise, taxPaise, inventory, toItcEligible, toReverseCharge);
  const net = new Map<string, { name: string; amount: number }>();
  const apply = (lines: BookLine[], sign: number) => {
    for (const line of lines) {
      const current = net.get(line.accountCode) || { name: line.accountName, amount: 0 };
      current.amount += sign * (line.debitPaise - line.creditPaise);
      net.set(line.accountCode, current);
    }
  };
  apply(before, -1);
  apply(after, 1);
  const lines: BookLine[] = [];
  for (const [accountCode, { name, amount }] of net) {
    if (amount === 0) continue;
    lines.push({ accountCode, accountName: name, debitPaise: amount > 0 ? amount : 0, creditPaise: amount < 0 ? -amount : 0 });
  }
  return lines;
}

export function assetAcquisitionEntry(costPaise:number,paymentAccountCode:"1000"|"1010"|"2000"):BookLine[]{const names={"1000":"Cash in hand","1010":"Bank account","2000":"Supplier money due"};return [{accountCode:"1500",accountName:"Fixed assets",debitPaise:costPaise,creditPaise:0},{accountCode:paymentAccountCode,accountName:names[paymentAccountCode],debitPaise:0,creditPaise:costPaise}]}
export function depreciationEntry(amountPaise:number):BookLine[]{return [{accountCode:"6200",accountName:"Depreciation expense",debitPaise:amountPaise,creditPaise:0},{accountCode:"1510",accountName:"Accumulated depreciation",debitPaise:0,creditPaise:amountPaise}]}
export function periodAdjustmentEntry(type:"provision"|"bad_debt"|"income_tax",amountPaise:number):BookLine[]{if(type==="income_tax")return [{accountCode:"6400",accountName:"Income tax expense",debitPaise:amountPaise,creditPaise:0},{accountCode:"2310",accountName:"Income tax payable",debitPaise:0,creditPaise:amountPaise}];return [{accountCode:"6300",accountName:"Provisions and bad debts",debitPaise:amountPaise,creditPaise:0},{accountCode:type==="bad_debt"?"1520":"2300",accountName:type==="bad_debt"?"Allowance for doubtful accounts":"Provisions and accrued expenses",debitPaise:0,creditPaise:amountPaise}]}

export function receiptEntry(amountPaise: number, cash = false): BookLine[] {
  return [
    { accountCode: cash ? "1000" : "1010", accountName: cash ? "Cash in hand" : "Bank account", debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: "1100", accountName: "Customer money due", debitPaise: 0, creditPaise: amountPaise },
  ];
}

export function supplierPaymentEntry(amountPaise: number, cash = false): BookLine[] {
  return [
    { accountCode: "2000", accountName: "Supplier money due", debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: cash ? "1000" : "1010", accountName: cash ? "Cash in hand" : "Bank account", debitPaise: 0, creditPaise: amountPaise },
  ];
}

export function payrollEntry(grossPaise: number, advancePaise: number, otherDeductionPaise: number, netPaise: number, cash = false): BookLine[] {
  return [
    { accountCode: "6100", accountName: "Salary expense", debitPaise: grossPaise, creditPaise: 0 },
    ...(advancePaise ? [{ accountCode: "1410", accountName: "Employee advances", debitPaise: 0, creditPaise: advancePaise }] : []),
    ...(otherDeductionPaise ? [{ accountCode: "2210", accountName: "Payroll deductions payable", debitPaise: 0, creditPaise: otherDeductionPaise }] : []),
    ...(netPaise ? [{ accountCode: cash ? "1000" : "1010", accountName: cash ? "Cash in hand" : "Bank account", debitPaise: 0, creditPaise: netPaise }] : []),
  ];
}

export function advanceEntry(type: "customer_received" | "supplier_paid" | "employee_paid", amountPaise: number, cash = false): BookLine[] {
  const money = { accountCode: cash ? "1000" : "1010", accountName: cash ? "Cash in hand" : "Bank account" };
  if (type === "customer_received") return [
    { ...money, debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: "2200", accountName: "Customer advances", debitPaise: 0, creditPaise: amountPaise },
  ];
  return [
    { accountCode: type === "supplier_paid" ? "1400" : "1410", accountName: type === "supplier_paid" ? "Supplier advances" : "Employee advances", debitPaise: amountPaise, creditPaise: 0 },
    { ...money, debitPaise: 0, creditPaise: amountPaise },
  ];
}

export function advanceApplicationEntry(type: "customer_received" | "supplier_paid", amountPaise: number): BookLine[] {
  return type === "customer_received" ? [
    { accountCode: "2200", accountName: "Customer advances", debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: "1100", accountName: "Customer money due", debitPaise: 0, creditPaise: amountPaise },
  ] : [
    { accountCode: "2000", accountName: "Supplier money due", debitPaise: amountPaise, creditPaise: 0 },
    { accountCode: "1400", accountName: "Supplier advances", debitPaise: 0, creditPaise: amountPaise },
  ];
}

export function adjustmentEntry(type: "sales_return" | "credit_note" | "purchase_return" | "debit_note", taxablePaise: number, taxPaise: number, costPaise = 0): BookLine[] {
  const total = taxablePaise + taxPaise;
  if (type === "sales_return" || type === "credit_note") {
    return [
      { accountCode: "4090", accountName: "Sales returned", debitPaise: taxablePaise, creditPaise: 0 },
      ...(taxPaise ? [{ accountCode: "2100", accountName: "GST payable", debitPaise: taxPaise, creditPaise: 0 }] : []),
      { accountCode: "1100", accountName: "Customer money due", debitPaise: 0, creditPaise: total },
      ...(type === "sales_return" && costPaise ? [
        { accountCode: "1200", accountName: "Stock on hand", debitPaise: costPaise, creditPaise: 0 },
        { accountCode: "5100", accountName: "Cost of goods sold", debitPaise: 0, creditPaise: costPaise },
      ] : []),
    ];
  }
  if (type === "purchase_return") {
    const stockCost = costPaise || taxablePaise;
    const difference = taxablePaise - stockCost;
    return [
      { accountCode: "2000", accountName: "Supplier money due", debitPaise: total, creditPaise: 0 },
      { accountCode: "1200", accountName: "Stock on hand", debitPaise: 0, creditPaise: stockCost },
      ...(difference > 0 ? [{ accountCode: "5090", accountName: "Purchase return variance", debitPaise: 0, creditPaise: difference }] : []),
      ...(difference < 0 ? [{ accountCode: "5090", accountName: "Purchase return variance", debitPaise: -difference, creditPaise: 0 }] : []),
      ...(taxPaise ? [{ accountCode: "1300", accountName: "Input GST credit", debitPaise: 0, creditPaise: taxPaise }] : []),
    ];
  }
  return [
    { accountCode: "2000", accountName: "Supplier money due", debitPaise: total, creditPaise: 0 },
    { accountCode: "5090", accountName: "Purchases returned", debitPaise: 0, creditPaise: taxablePaise },
    ...(taxPaise ? [{ accountCode: "1300", accountName: "Input GST credit", debitPaise: 0, creditPaise: taxPaise }] : []),
  ];
}

export function reportFromBalances(balances: Record<string, number>) {
  const value = (code: string) => balances[code] || 0;
  const assets = value("1000") + value("1010") + value("1100") + value("1200") + value("1300") + value("1400") + value("1410") + value("1420") + value("1430") + value("1500") - value("1510") - value("1520") + value("1600");
  const liabilities = value("2000") + value("2100") + value("2200") + value("2210") + value("2300") + value("2310") + value("2320") + value("2330") + value("2400");
  const equity = value("3000") + value("3100") + value("3200");
  const income = value("4000") + value("4010") - value("4090");
  const expenses = value("5000") - value("5090") + value("5100") + value("6000") + value("6100") + value("6200") + value("6300") + value("6400");
  return { assets, liabilities, equity, income, expenses, profit: income - expenses };
}
