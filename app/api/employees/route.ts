import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "../../../db";
import { employees } from "../../../db/schema";
import { getChatGPTUser } from "../../company-auth";

const optional = (max: number) =>
  z.string().trim().max(max).optional().default("");
const schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(1).max(20),
    email: z
      .union([z.string().trim().email(), z.literal("")])
      .optional()
      .default(""),
    role: z.string().trim().min(1).max(100),
    department: optional(100),
    employmentType: z.enum(["full_time", "part_time", "contract", "intern"]),
    joiningDate: optional(10),
    monthlySalary: z.string().optional().default("0"),
    pan: optional(10),
    aadhaarLast4: optional(4),
    address: optional(400),
    emergencyContact: optional(120),
    status: z.enum(["active", "inactive", "on_leave"]),
  })
  .superRefine((v, c) => {
    const phone = v.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(phone))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Enter a valid Indian mobile number.",
      });
    if (v.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan.toUpperCase()))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pan"],
        message: "Enter a valid PAN.",
      });
    if (v.aadhaarLast4 && !/^\d{4}$/.test(v.aadhaarLast4))
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aadhaarLast4"],
        message: "Enter only the last 4 Aadhaar digits.",
      });
  });
const blank = (v: string) => v || null;
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
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        message:
          parsed.error.issues[0]?.message || "Check the employee details.",
      },
      { status: 400 },
    );
  const d = parsed.data;
  const salary = Math.round(Number(d.monthlySalary || 0) * 100);
  if (!Number.isFinite(salary) || salary < 0)
    return NextResponse.json({ message: "Check the salary." }, { status: 400 });
  const now = new Date();
  const phone = d.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  try {
    await getDb()
      .insert(employees)
      .values({
        id: crypto.randomUUID(),
        ownerUserId: user.id,
        name: d.name,
        phone,
        email: blank(d.email),
        role: d.role,
        department: blank(d.department),
        employmentType: d.employmentType,
        joiningDate: blank(d.joiningDate),
        monthlySalaryPaise: salary,
        pan: blank(d.pan.toUpperCase()),
        aadhaarLast4: blank(d.aadhaarLast4),
        address: blank(d.address),
        emergencyContact: blank(d.emergencyContact),
        status: d.status,
        createdAt: now,
        updatedAt: now,
      });
  } catch (error) {
    console.error("Employee save failed", error);
    return NextResponse.json(
      { message: "Employee could not be saved. Please try again." },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { message: "Employee saved successfully." },
    { status: 201 },
  );
}
