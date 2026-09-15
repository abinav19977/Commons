import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";

const schema = z.object({
  customerId: z.string().max(80).optional().default(""),
  customerName: z.string().trim().min(1).max(160),
  channel: z.enum(["whatsapp", "email"]),
  outstandingPaise: z.number().int().nonnegative(),
  message: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ message: "Invalid reminder." }, { status: 400 });
  const data = parsed.data;
  try {
    await getRawDb()
      .prepare(
        "INSERT INTO reminder_logs (id,owner_user_id,customer_id,customer_name,channel,outstanding_paise,message,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        data.customerId || null,
        data.customerName,
        data.channel,
        data.outstandingPaise,
        data.message,
        "opened",
        Date.now(),
      )
      .run();
  } catch (error) {
    console.error("Reminder log failed", error);
    return NextResponse.json({ message: "Reminder activity could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ message: "Reminder opened." });
}
