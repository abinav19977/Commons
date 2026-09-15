"use client";
import { Printer } from "lucide-react";
export default function PrintButton() {
  return (
    <button
      className="print-button no-print"
      type="button"
      onClick={() => window.print()}
    >
      <Printer /> Print / Save PDF
    </button>
  );
}
