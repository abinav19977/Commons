import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { employees } from "../../db/schema";
import type { EmployeeView } from "./employee-data";

function toEmployee(row: typeof employees.$inferSelect): EmployeeView {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    department: row.department,
    employmentType: row.employmentType,
    joiningDate: row.joiningDate,
    monthlySalaryPaise: row.monthlySalaryPaise,
    pan: row.pan,
    aadhaarLast4: row.aadhaarLast4,
    address: row.address,
    emergencyContact: row.emergencyContact,
    status: row.status,
  };
}

export async function listEmployees(ownerUserId: string) {
  const rows = await getDb()
    .select()
    .from(employees)
    .where(eq(employees.ownerUserId, ownerUserId))
    .orderBy(asc(employees.name));
  return rows.map(toEmployee);
}

export async function findEmployee(ownerUserId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(employees)
    .where(and(eq(employees.ownerUserId, ownerUserId), eq(employees.id, id)))
    .limit(1);
  return rows[0] ? toEmployee(rows[0]) : null;
}
