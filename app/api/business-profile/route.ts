import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "../../../db";
import { businessProfiles } from "../../../db/schema";
import { getChatGPTUser } from "../../company-auth";
const o = (n: number) => z.string().trim().max(n).optional().default("");
const schema = z
  .object({
    createOnly: z.boolean().optional().default(false),
    legalName: z.string().trim().min(1).max(160),
    tradeName: o(160),
    phone: o(20),
    email: z
      .union([z.string().trim().email(), z.literal("")])
      .optional()
      .default(""),
    gstin: o(15),
    pan: o(10),
    invoicePrefix: z.string().trim().min(1).max(12),
    addressLine1: o(180),
    addressLine2: o(180),
    city: o(80),
    state: o(80),
    pinCode: o(6),
    bankName: o(120),
    accountName: o(120),
    accountNumber: o(40),
    ifsc: o(11),
    terms: o(600),
  })
  .superRefine((v, c) => {
    if (
      v.gstin &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
        v.gstin.toUpperCase(),
      )
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstin"],
        message: "Enter a valid GSTIN.",
      });
    if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.pan.toUpperCase()))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pan"],
        message: "Enter a valid PAN.",
      });
    if (v.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc.toUpperCase()))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ifsc"],
        message: "Enter a valid IFSC.",
      });
  });
const b = (v: string) => v || null;
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
    return NextResponse.json({ message: "Invalid form." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message || "Check the business details.",
      },
      { status: 400 },
    );
  const d = parsed.data;
  const now = new Date();
  const values = {
    ownerUserId: user.id,
    legalName: d.legalName,
    tradeName: b(d.tradeName),
    gstin: b(d.gstin.toUpperCase()),
    pan: b(d.pan.toUpperCase()),
    phone: b(d.phone),
    email: b(d.email),
    addressLine1: b(d.addressLine1),
    addressLine2: b(d.addressLine2),
    city: b(d.city),
    state: b(d.state),
    pinCode: b(d.pinCode),
    bankName: b(d.bankName),
    accountName: b(d.accountName),
    accountNumber: b(d.accountNumber),
    ifsc: b(d.ifsc.toUpperCase()),
    invoicePrefix: d.invoicePrefix.toUpperCase(),
    terms: b(d.terms),
    updatedAt: now,
  };
  try {
    if (d.createOnly) {
      await getDb().insert(businessProfiles).values(values);
    } else await getDb().insert(businessProfiles).values(values).onConflictDoUpdate({
      target: businessProfiles.ownerUserId,
      set: values,
    });
  } catch (error) {
    console.error("Business profile save failed", error);
    return NextResponse.json(
      { message: "Business profile could not be saved." },
      { status: 500 },
    );
  }
  return NextResponse.json({ message: "Business profile saved." });
}
