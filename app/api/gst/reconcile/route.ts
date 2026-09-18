import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";

const schema = z.object({ taxPeriod: z.string().regex(/^\d{4}-\d{2}$/), csv: z.string().min(1).max(8_000_000) });
type Row = Record<string, string>;

function splitCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) { if (c === "\r" && text[i + 1] === "\n") i++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += c;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const doc = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const gstin = (value: string) => value.toUpperCase().replace(/\s/g, "");
const paise = (value = "") => Math.round((Number(value.replace(/[,₹\s]/g, "")) || 0) * 100);
function pick(row: Row, names: string[]) { for (const name of names) if (row[key(name)] !== undefined) return row[key(name)]; return ""; }

export async function GET(request: Request) {
  const user = await getChatGPTUser(request); if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const taxPeriod = new URL(request.url).searchParams.get("taxPeriod") || "";
  if (!/^\d{4}-\d{2}$/.test(taxPeriod)) return NextResponse.json({ message: "Choose a tax month." }, { status: 400 });
  const rows = (await getRawDb().prepare(
    "SELECT g.id,g.invoice_number,g.supplier_name,g.match_status,g.matched_purchase_id,p.itc_eligible,p.reverse_charge FROM gst_2b_entries g LEFT JOIN purchases p ON p.id=g.matched_purchase_id AND p.owner_user_id=g.owner_user_id WHERE g.owner_user_id=? AND g.tax_period=? AND g.match_status!='matched' ORDER BY g.invoice_number",
  ).bind(user.id, taxPeriod).all<{ id: string; invoice_number: string; supplier_name: string | null; match_status: string; matched_purchase_id: string | null; itc_eligible: number | null; reverse_charge: number | null }>()).results || [];
  return NextResponse.json({ entries: rows });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request); if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Choose a tax month and upload a valid CSV file under 8 MB." }, { status: 400 });
  const rows = splitCsv(parsed.data.csv); if (rows.length < 2) return NextResponse.json({ message: "The CSV has no invoice rows." }, { status: 400 });
  if (rows.length > 2001) return NextResponse.json({ message: "This file has more than 2,000 rows. Export one tax period at a time." }, { status: 413 });
  const headers = rows[0].map(key); const data = rows.slice(1).map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
  const records = data.map((row, index) => ({
    index: index + 2,
    supplierGstin: gstin(pick(row, ["GSTIN of supplier", "Supplier GSTIN", "GSTIN"])),
    supplierName: pick(row, ["Trade/Legal name", "Supplier name", "Trade name"]),
    invoiceNumber: pick(row, ["Invoice number", "Invoice no", "Document number", "Doc no"]),
    invoiceDate: pick(row, ["Invoice date", "Document date", "Doc date"]),
    taxablePaise: paise(pick(row, ["Taxable value", "Taxable amount"])),
    igstPaise: paise(pick(row, ["Integrated tax", "IGST", "IGST amount"])),
    cgstPaise: paise(pick(row, ["Central tax", "CGST", "CGST amount"])),
    sgstPaise: paise(pick(row, ["State/UT tax", "State tax", "SGST", "SGST amount"])),
    cessPaise: paise(pick(row, ["Cess", "Cess amount"])),
  })).filter(row => row.supplierGstin || row.invoiceNumber);
  const invalid = records.find(row => !/^[0-9A-Z]{15}$/.test(row.supplierGstin) || !row.invoiceNumber);
  if (invalid) return NextResponse.json({ message: `Row ${invalid.index} needs a 15-character supplier GSTIN and invoice number.` }, { status: 400 });
  if (!records.length) return NextResponse.json({ message: "No GST invoice rows were recognised. Use the portal CSV with GSTIN and invoice-number columns." }, { status: 400 });
  const raw = getRawDb(); const start = `${parsed.data.taxPeriod}-01`; const [y, m] = parsed.data.taxPeriod.split("-").map(Number); const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const purchases = (await raw.prepare("SELECT id,supplier_gstin,supplier_invoice_number,gst_paise,itc_eligible FROM purchases WHERE owner_user_id=? AND purchase_date BETWEEN ? AND ? AND status IN ('received','part_paid','paid')").bind(user.id, start, end).all<{id:string;supplier_gstin:string|null;supplier_invoice_number:string|null;gst_paise:number;itc_eligible:number}>()).results || [];
  const purchaseMap = new Map(purchases.filter(p => p.supplier_gstin && p.supplier_invoice_number).map(p => [`${gstin(p.supplier_gstin!)}|${doc(p.supplier_invoice_number!)}`, p])); const matchedPurchases = new Set<string>();
  const prepared = records.map(row => { const purchase = purchaseMap.get(`${row.supplierGstin}|${doc(row.invoiceNumber)}`); if (purchase) matchedPurchases.add(purchase.id); const tax = row.igstPaise + row.cgstPaise + row.sgstPaise + row.cessPaise; return { ...row, purchase, matchStatus: !purchase ? "portal_only" : Math.abs(Number(purchase.gst_paise) - tax) <= 100 ? "matched" : "amount_mismatch" }; });
  const statements = [raw.prepare("DELETE FROM gst_2b_entries WHERE owner_user_id=? AND tax_period=?").bind(user.id, parsed.data.taxPeriod), ...prepared.map(row => raw.prepare("INSERT INTO gst_2b_entries (id,owner_user_id,tax_period,supplier_gstin,supplier_name,invoice_number,invoice_date,taxable_paise,igst_paise,cgst_paise,sgst_paise,cess_paise,match_status,matched_purchase_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), user.id, parsed.data.taxPeriod, row.supplierGstin, row.supplierName || null, row.invoiceNumber, row.invoiceDate || null, row.taxablePaise, row.igstPaise, row.cgstPaise, row.sgstPaise, row.cessPaise, row.matchStatus, row.purchase?.id || null, Date.now()))];
  try { for (let i = 0; i < statements.length; i += 100) await raw.batch(statements.slice(i, i + 100)); } catch (error) { console.error("GSTR-2B reconciliation failed", error); return NextResponse.json({ message: "The reconciliation could not be saved. No accounting entries were posted." }, { status: 500 }); }
  const summary = { total: prepared.length, matched: prepared.filter(r => r.matchStatus === "matched").length, amountMismatch: prepared.filter(r => r.matchStatus === "amount_mismatch").length, portalOnly: prepared.filter(r => r.matchStatus === "portal_only").length, booksOnly: purchases.filter(p => p.itc_eligible && !matchedPurchases.has(p.id)).length };
  return NextResponse.json({ ...summary, message: `${summary.matched} matched; ${summary.amountMismatch + summary.portalOnly + summary.booksOnly} item(s) need review. No ledger entries were changed.` });
}
