import { env } from "cloudflare:workers";

export type IntelligenceAlert = {
  level: "urgent" | "attention" | "info";
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
};
export type IntelligenceResult = {
  mode: "llm" | "analytical";
  summary: string;
  alerts: IntelligenceAlert[];
};

export async function generateBusinessIntelligence(metrics: {
  revenuePaise: number;
  customers: number;
  products: number;
  employees: number;
  invoices: number;
  lowStock: number;
  overdueReceivables: number;
  overduePaise: number;
  pendingPayroll: number;
  pendingPayrollPaise: number;
  bankReview: number;
}): Promise<IntelligenceResult> {
  const fallback: IntelligenceResult = {
    mode: "analytical",
    summary: `Commons reviewed ${metrics.products} products, ${metrics.invoices} invoices and ${metrics.customers} customer accounts. ${metrics.overdueReceivables > 0 ? `${metrics.overdueReceivables} overdue customer account${metrics.overdueReceivables === 1 ? " needs" : "s need"} collection follow-up.` : metrics.lowStock > 0 ? `${metrics.lowStock} stock item${metrics.lowStock === 1 ? " needs" : "s need"} action.` : "Inventory and receivable thresholds are currently clear."}`,
    alerts: [
      ...(metrics.overdueReceivables > 0
        ? [
            {
              level: "urgent" as const,
              title: "Receivables follow-up",
              detail: `${metrics.overdueReceivables} customer account${metrics.overdueReceivables === 1 ? " has" : "s have"} crossed the reminder threshold, totalling ₹${(metrics.overduePaise / 100).toLocaleString("en-IN")}.`,
              actionLabel: "Open reminder queue",
              href: "/receivables",
            },
          ]
        : []),
      ...(metrics.lowStock > 0
        ? [
            {
              level: "urgent" as const,
              title: "Low-stock risk",
              detail: `${metrics.lowStock} item${metrics.lowStock === 1 ? " is" : "s are"} at or below the reorder level. Record a purchase or restock before the next sale.`,
              actionLabel: "Review products",
              href: "/products/existing",
            },
          ]
        : []),
      ...(metrics.pendingPayroll > 0
        ? [
            {
              level: "attention" as const,
              title: "Salary payments pending",
              detail: `${metrics.pendingPayroll} salary record${metrics.pendingPayroll === 1 ? " is" : "s are"} pending, totalling ₹${(metrics.pendingPayrollPaise / 100).toLocaleString("en-IN")}.`,
              actionLabel: "Open payroll",
              href: "/finance/payroll",
            },
          ]
        : []),
      ...(metrics.bankReview > 0
        ? [
            {
              level: "attention" as const,
              title: "Bank matches need review",
              detail: `${metrics.bankReview} imported bank transaction${metrics.bankReview === 1 ? " needs" : "s need"} confirmation before business records can be changed.`,
              actionLabel: "Open reconciliation",
              href: "/banking",
            },
          ]
        : []),
      {
        level: "attention",
        title: "Procurement check",
        detail:
          "Reconcile supplier invoices against received raw materials and resale goods.",
        actionLabel: "Choose supplier",
        href: "/purchases/suppliers",
      },
      {
        level: "info",
        title: "Production control",
        detail:
          "For manufactured goods, record material consumption during restocking to maintain accurate raw-material balance.",
        actionLabel: "Open inventory",
        href: "/products/existing",
      },
    ],
  };
  const key = (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  if (!key) return fallback;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: `You are an Indian small-business operations analyst. In one concise sentence, summarize these metrics and state the highest-priority action. Revenue paise: ${metrics.revenuePaise}; customers: ${metrics.customers}; products: ${metrics.products}; employees: ${metrics.employees}; invoices: ${metrics.invoices}; low-stock items: ${metrics.lowStock}; overdue customer accounts: ${metrics.overdueReceivables}; overdue receivables paise: ${metrics.overduePaise}; pending payroll records: ${metrics.pendingPayroll}; pending payroll paise: ${metrics.pendingPayrollPaise}; bank transactions requiring review: ${metrics.bankReview}. Do not invent facts.`,
        max_output_tokens: 1000, reasoning: { effort: "low" },
      }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { output_text?: string };
    return {
      ...fallback,
      mode: "llm",
      summary: data.output_text?.trim() || fallback.summary,
    };
  } catch {
    return fallback;
  }
}
