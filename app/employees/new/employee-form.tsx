"use client";
import { companyFetch } from "@/app/company-fetch";
import { FormEvent, useState } from "react";

export default function EmployeeForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await companyFetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Could not save the employee.");
      form.reset();
      setStatus("success");
      setMessage("Employee saved successfully.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save the employee.",
      );
    }
  }
  return (
    <form className="customer-form" onSubmit={submit}>
      <div className="customer-name-section">
        <label>
          <span>Employee name *</span>
          <input
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            placeholder="Enter full name"
            autoFocus
          />
        </label>
      </div>
      <fieldset className="form-section">
        <legend>Employment</legend>
        <div className="form-grid">
          <label>
            <span>Role *</span>
            <input name="role" required maxLength={100} />
          </label>
          <label>
            <span>Department</span>
            <input name="department" maxLength={100} />
          </label>
          <label>
            <span>Employment type</span>
            <select name="employmentType" defaultValue="full_time">
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
          </label>
          <label>
            <span>Joining date</span>
            <input name="joiningDate" type="date" />
          </label>
          <label>
            <span>Monthly salary (₹)</span>
            <input
              name="monthlySalary"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue="active">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset className="form-section">
        <legend>Contact & identity</legend>
        <div className="form-grid">
          <label>
            <span>Phone *</span>
            <input
              name="phone"
              required
              inputMode="tel"
              maxLength={15}
              placeholder="9876543210"
            />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" maxLength={160} />
          </label>
          <label>
            <span>PAN</span>
            <input
              name="pan"
              maxLength={10}
              className="uppercase-input"
              placeholder="AAAAA0000A"
            />
          </label>
          <label>
            <span>Last 4 digits of Aadhaar</span>
            <input
              name="aadhaarLast4"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
            />
          </label>
          <label className="wide-field">
            <span>Address</span>
            <textarea name="address" rows={3} maxLength={400} />
          </label>
          <label className="wide-field">
            <span>Emergency contact</span>
            <input
              name="emergencyContact"
              maxLength={120}
              placeholder="Name and phone number"
            />
          </label>
        </div>
      </fieldset>
      <div className="form-footer">
        <div className={"form-status " + status} role="status">
          {message}
        </div>
        <button
          className="save-customer"
          type="submit"
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save employee"}
        </button>
      </div>
    </form>
  );
}
