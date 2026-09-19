import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "../../company-auth";
import { getRawDb } from "../../../db";

const schema = z.object({ question: z.string().trim().min(2).max(800), context: z.string().trim().max(40) });

function responseText(data: unknown) {
  const value = data as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (value.output_text) return value.output_text.trim();
  return value.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join(" ").trim() || "";
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Ask a short, clear question." }, { status: 400 });
  const key = request.headers.get("x-commons-ai-key")?.trim();
  if (!key || key.length < 20) return NextResponse.json({ message: "Add an AI API key in Settings for open-ended questions." }, { status: 428 });
  try {
    // A compact, read-only snapshot so questions like "who is my biggest customer" can be
    // answered from real figures instead of guessed. Aggregates only, no invoice detail.
    let snapshot = "No business figures available.";
    try {
      const raw = getRawDb();
      const [top, totals] = await Promise.all([
        raw.prepare("SELECT customer_name name,SUM(total_paise) sales,COUNT(*) bills,SUM(total_paise-paid_paise) due FROM invoices WHERE owner_user_id=? AND status!='cancelled' GROUP BY customer_name ORDER BY sales DESC LIMIT 5").bind(user.id).all<{ name: string; sales: number; bills: number; due: number }>(),
        raw.prepare("SELECT COUNT(*) bills,COALESCE(SUM(total_paise),0) sales,COALESCE(SUM(total_paise-paid_paise),0) due FROM invoices WHERE owner_user_id=? AND status!='cancelled'").bind(user.id).first<{ bills: number; sales: number; due: number }>(),
      ]);
      const rs = (p: number) => "Rs " + Math.round(p / 100).toLocaleString("en-IN");
      snapshot = `All bills: ${totals?.bills || 0}, total sales ${rs(totals?.sales || 0)}, unpaid ${rs(totals?.due || 0)}. Top customers by sales: ${top.results.map((r) => `${r.name} ${rs(r.sales)} (${r.bills} bills, unpaid ${rs(r.due)})`).join("; ") || "none yet"}.`;
    } catch { /* answer without figures rather than fail */ }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_output_tokens: 1500, reasoning: { effort: "low" },
        input: [
          { role: "system", content: "You are Commons Copilot for an Indian small business. Answer in plain language, concisely and accurately. Explain accounting and GST without pretending advice is a filed return or professional approval. Never propose false bills, hidden names, tax evasion, deletion of audit history, or posting uncertain bank matches. For financial actions, explain what the user must review before confirming it in Commons." },
          { role: "user", content: `Current Commons area: ${parsed.data.context}. Business figures (use these for any question about customers or sales, and say so if they don't cover it): ${snapshot}\nQuestion: ${parsed.data.question}` },
        ],
      }),
    });
    if (!response.ok) {
      const detail = ((await response.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message || "";
      const message = response.status === 401 ? "OpenAI rejected this key. It may be mistyped, revoked or from a different account. Create a new key and paste it in Settings."
        : response.status === 429 ? "OpenAI accepted the key but has no usable credit or the rate limit was hit. Check billing and usage limits on your OpenAI account."
        : response.status === 404 || response.status === 403 ? "This key's project does not have access to the required model. Enable it in the OpenAI project settings."
        : `OpenAI returned an error (${response.status}). ${detail.slice(0, 160)}`;
      return NextResponse.json({ message }, { status: 502 });
    }
    const answer = responseText(await response.json());
    if (!answer) return NextResponse.json({ message: "No answer was returned." }, { status: 502 });
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ message: "The AI connection is temporarily unavailable." }, { status: 502 });
  }
}
