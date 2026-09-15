import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";

const schema = z.object({
  overdueDays: z.number().int().min(0).max(3650),
  minimumOutstanding: z.number().min(0).max(1000000000),
  preferredChannel: z.enum(["both", "whatsapp", "email"]),
  messageTemplate: z.string().trim().min(20).max(1000),
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check reminder settings." },
      { status: 400 },
    );
  const data = parsed.data;
  try {
    await getRawDb()
      .prepare(
        "INSERT INTO receivable_settings (owner_user_id,overdue_days,minimum_outstanding_paise,preferred_channel,message_template,enabled,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_user_id) DO UPDATE SET overdue_days=excluded.overdue_days,minimum_outstanding_paise=excluded.minimum_outstanding_paise,preferred_channel=excluded.preferred_channel,message_template=excluded.message_template,enabled=excluded.enabled,updated_at=excluded.updated_at",
      )
      .bind(
        user.id,
        data.overdueDays,
        Math.round(data.minimumOutstanding * 100),
        data.preferredChannel,
        data.messageTemplate,
        data.enabled ? 1 : 0,
        Date.now(),
      )
      .run();
  } catch (error) {
    console.error("Receivable settings save failed", error);
    return NextResponse.json({ message: "Settings could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ message: "Reminder rules saved." });
}
