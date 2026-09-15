import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "../../company-auth";

export const dynamic = "force-dynamic";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default("");
const customerSchema = z
  .object({
    customerType: z.enum(["business", "individual"]),
    displayName: z
      .string()
      .trim()
      .min(1, "Customer name is required.")
      .max(120),
    nickname: optionalText(80),
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
    bankAccountLast4: optionalText(4),
    placeOfSupply: optionalText(80),
    billingAddressLine1: optionalText(180),
    billingAddressLine2: optionalText(180),
    billingCity: optionalText(80),
    billingState: optionalText(80),
    billingPinCode: optionalText(6),
    shippingSameAsBilling: z.boolean(),
    shippingAddressLine1: optionalText(180),
    shippingAddressLine2: optionalText(180),
    shippingCity: optionalText(80),
    shippingState: optionalText(80),
    shippingPinCode: optionalText(6),
    creditDays: z.string().trim().optional().default("0"),
    creditLimit: z.string().trim().optional().default("0"),
    openingBalance: z.string().trim().optional().default("0"),
    balanceType: z.enum(["receivable", "payable"]),
    notes: optionalText(1000),
  })
  .superRefine((value, context) => {
    const gstin = value.gstin.toUpperCase();
    const pan = value.pan.toUpperCase();
    const phone = normalizePhone(value.primaryPhone);
    const secondaryPhone = normalizePhone(value.secondaryPhone);

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
      ["regular", "composition", "sez"].includes(value.gstRegistrationType) &&
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
    if (value.bankAccountLast4 && !/^\d{4}$/.test(value.bankAccountLast4))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankAccountLast4"],
        message: "Enter the last four bank account digits.",
      });
    if (value.billingPinCode && !/^[1-9][0-9]{5}$/.test(value.billingPinCode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingPinCode"],
        message: "Enter a valid PIN code.",
      });
    if (value.shippingPinCode && !/^[1-9][0-9]{5}$/.test(value.shippingPinCode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shippingPinCode"],
        message: "Enter a valid shipping PIN code.",
      });
  });

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}

function paise(value: string) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
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

  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message || "Check the customer details.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const creditDays = Number.parseInt(data.creditDays || "0", 10);
  const creditLimitPaise = paise(data.creditLimit);
  const openingBalancePaise = paise(data.openingBalance);
  if (
    !Number.isInteger(creditDays) ||
    creditDays < 0 ||
    creditDays > 3650 ||
    creditLimitPaise === null ||
    openingBalancePaise === null
  ) {
    return NextResponse.json(
      { message: "Check the credit and balance values." },
      { status: 400 },
    );
  }

  const now = Date.now();
  try {
    await env.DB.prepare(
      `
      INSERT INTO customers (
        id, owner_user_id, customer_type, display_name, nickname, contact_name, primary_phone,
        secondary_phone, email, gst_registration_type, gstin, pan, place_of_supply,
        bank_account_last4,
        billing_address_line_1, billing_address_line_2, billing_city, billing_state,
        billing_pin_code, shipping_same_as_billing, shipping_address_line_1,
        shipping_address_line_2, shipping_city, shipping_state, shipping_pin_code,
        credit_days, credit_limit_paise, opening_balance_paise, balance_type, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(
        crypto.randomUUID(),
        user.id,
        data.customerType,
        data.displayName,
        emptyToNull(data.nickname),
        emptyToNull(data.contactName),
        normalizePhone(data.primaryPhone),
        emptyToNull(normalizePhone(data.secondaryPhone)),
        emptyToNull(data.email),
        data.gstRegistrationType,
        emptyToNull(data.gstin.toUpperCase()),
        emptyToNull(data.pan.toUpperCase()),
        emptyToNull(data.placeOfSupply),
        emptyToNull(data.bankAccountLast4),
        emptyToNull(data.billingAddressLine1),
        emptyToNull(data.billingAddressLine2),
        emptyToNull(data.billingCity),
        emptyToNull(data.billingState),
        emptyToNull(data.billingPinCode),
        data.shippingSameAsBilling ? 1 : 0,
        data.shippingSameAsBilling
          ? emptyToNull(data.billingAddressLine1)
          : emptyToNull(data.shippingAddressLine1),
        data.shippingSameAsBilling
          ? emptyToNull(data.billingAddressLine2)
          : emptyToNull(data.shippingAddressLine2),
        data.shippingSameAsBilling
          ? emptyToNull(data.billingCity)
          : emptyToNull(data.shippingCity),
        data.shippingSameAsBilling
          ? emptyToNull(data.billingState)
          : emptyToNull(data.shippingState),
        data.shippingSameAsBilling
          ? emptyToNull(data.billingPinCode)
          : emptyToNull(data.shippingPinCode),
        creditDays,
        creditLimitPaise,
        openingBalancePaise,
        data.balanceType,
        emptyToNull(data.notes),
        now,
        now,
      )
      .run();
  } catch (error) {
    console.error("Customer save failed", error);
    const message =
      error instanceof Error && error.message.includes("UNIQUE")
        ? "A customer with this GSTIN already exists."
        : "Customer could not be saved. Please try again.";
    return NextResponse.json({ message }, { status: 500 });
  }

  return NextResponse.json(
    { message: "Customer saved successfully." },
    { status: 201 },
  );
}

const identitySchema = z.object({
  id: z.string().trim().min(1).max(100),
  nickname: z.string().trim().max(80),
  bankAccountLast4: z.union([z.string().regex(/^\d{4}$/), z.literal("")]),
});

export async function PATCH(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = identitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Check the customer identifiers." },
      { status: 400 },
    );
  try {
    const result = await env.DB.prepare(
      "UPDATE customers SET nickname = ?,bank_account_last4 = ?,updated_at = ? WHERE id = ? AND owner_user_id = ?",
    )
      .bind(
        emptyToNull(parsed.data.nickname),
        emptyToNull(parsed.data.bankAccountLast4),
        Date.now(),
        parsed.data.id,
        user.id,
      )
      .run();
    if (!result.meta.changes)
      return NextResponse.json({ message: "Customer was not found." }, { status: 404 });
    return NextResponse.json({ message: "Customer summary identity updated." });
  } catch (error) {
    console.error("Customer identity update failed", error);
    return NextResponse.json({ message: "Customer identifiers could not be saved." }, { status: 500 });
  }
}
