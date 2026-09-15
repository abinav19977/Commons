import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../db";
import { getChatGPTUser } from "../../company-auth";

export const dynamic = "force-dynamic";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");
const supplierSchema = z
  .object({
    name: z.string().trim().min(1, "Supplier name is required.").max(160),
    contactName: optionalText(120),
    primaryPhone: z
      .string()
      .trim()
      .min(1, "Primary phone is required.")
      .max(20),
    secondaryPhone: optionalText(20),
    email: z
      .union([
        z.string().trim().email("Enter a valid email address."),
        z.literal(""),
      ])
      .optional()
      .default(""),
    gstRegistrationType: z.enum([
      "unregistered",
      "regular",
      "composition",
      "sez",
      "overseas",
    ]),
    gstin: optionalText(15),
    pan: optionalText(10),
    addressLine1: optionalText(180),
    addressLine2: optionalText(180),
    city: optionalText(80),
    state: optionalText(80),
    pinCode: optionalText(6),
    paymentTermsDays: z.string().trim().optional().default("0"),
    openingPayable: z.string().trim().optional().default("0"),
    notes: optionalText(1000),
    active: z.boolean(),
  })
  .superRefine((value, context) => {
    const phone = normalizePhone(value.primaryPhone);
    const secondaryPhone = normalizePhone(value.secondaryPhone);
    const gstin = value.gstin.toUpperCase();
    const pan = value.pan.toUpperCase();
    if (!/^[6-9][0-9]{9}$/.test(phone))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryPhone"],
        message: "Enter a valid 10-digit Indian mobile number.",
      });
    if (secondaryPhone && !/^[6-9][0-9]{9}$/.test(secondaryPhone))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondaryPhone"],
        message: "Enter a valid secondary mobile number.",
      });
    if (
      gstin &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstin"],
        message: "Enter a valid 15-character GSTIN.",
      });
    if (
      ["regular", "composition", "sez"].includes(
        value.gstRegistrationType,
      ) &&
      !gstin
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstin"],
        message: "GSTIN is required for this registration type.",
      });
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pan"],
        message: "Enter a valid PAN.",
      });
    if (value.pinCode && !/^[1-9][0-9]{5}$/.test(value.pinCode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pinCode"],
        message: "Enter a valid PIN code.",
      });
  });

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}

function emptyToNull(value: string) {
  return value || null;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json(
      { message: "Please sign in again." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "The submitted form could not be read." },
      { status: 400 },
    );
  }
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check supplier details." },
      { status: 400 },
    );
  const data = parsed.data;
  const paymentTermsDays = Number.parseInt(data.paymentTermsDays || "0", 10);
  const openingPayable = Number(data.openingPayable || 0);
  if (
    !Number.isInteger(paymentTermsDays) ||
    paymentTermsDays < 0 ||
    paymentTermsDays > 3650 ||
    !Number.isFinite(openingPayable) ||
    openingPayable < 0
  )
    return NextResponse.json(
      { message: "Check payment terms and opening payable." },
      { status: 400 },
    );
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await getRawDb()
      .prepare(
        "INSERT INTO suppliers (id,owner_user_id,name,contact_name,primary_phone,secondary_phone,email,gst_registration_type,gstin,pan,address_line_1,address_line_2,city,state,pin_code,payment_terms_days,opening_payable_paise,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        user.id,
        data.name,
        emptyToNull(data.contactName),
        normalizePhone(data.primaryPhone),
        emptyToNull(normalizePhone(data.secondaryPhone)),
        emptyToNull(data.email),
        data.gstRegistrationType,
        emptyToNull(data.gstin.toUpperCase()),
        emptyToNull(data.pan.toUpperCase()),
        emptyToNull(data.addressLine1),
        emptyToNull(data.addressLine2),
        emptyToNull(data.city),
        emptyToNull(data.state),
        emptyToNull(data.pinCode),
        paymentTermsDays,
        Math.round(openingPayable * 100),
        emptyToNull(data.notes),
        data.active ? 1 : 0,
        now,
        now,
      )
      .run();
  } catch (error) {
    console.error("Supplier save failed", error);
    const message =
      error instanceof Error && error.message.includes("UNIQUE")
        ? "A supplier with this GSTIN already exists."
        : "Supplier could not be saved. Please try again.";
    return NextResponse.json({ message }, { status: 500 });
  }
  return NextResponse.json(
    { id, message: "Supplier saved successfully." },
    { status: 201 },
  );
}
