import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "../../company-auth";

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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_output_tokens: 260,
        input: [
          { role: "system", content: "You are Commons Copilot for an Indian small business. Answer in plain language, concisely and accurately. Explain accounting and GST without pretending advice is a filed return or professional approval. Never propose false bills, hidden names, tax evasion, deletion of audit history, or posting uncertain bank matches. For financial actions, explain what the user must review before confirming it in Commons." },
          { role: "user", content: `Current Commons area: ${parsed.data.context}. Question: ${parsed.data.question}` },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ message: "The AI connection could not answer. Check the key in Settings." }, { status: 502 });
    const answer = responseText(await response.json());
    if (!answer) return NextResponse.json({ message: "No answer was returned." }, { status: 502 });
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ message: "The AI connection is temporarily unavailable." }, { status: 502 });
  }
}
