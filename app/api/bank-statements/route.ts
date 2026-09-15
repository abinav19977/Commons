import { NextResponse } from "next/server";
import { getRawDb } from "../../../db";
import { getChatGPTUser } from "../../company-auth";
import { simpleEntry } from "../../lib/accounting";
import { assertPeriodOpen, prepareJournal } from "../../lib/book-server";

type CsvRecord = Record<string, string>;
type NormalizedRow = {
  transactionDate: string;
  valueDate: string | null;
  direction: "credit" | "debit";
  amountPaise: number;
  description: string;
  reference: string;
  statementAccountLast4: string | null;
  counterpartyAccountLast4: string | null;
};

function csvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): CsvRecord[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = csvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return lines.slice(1).map((line) => {
    const values = csvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function pick(row: CsvRecord, aliases: string[]) {
  for (const alias of aliases) if (row[alias]) return row[alias];
  return "";
}

function dateValue(value: string) {
  const clean = value.trim();
  let match = clean.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = clean.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = Date.parse(clean);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function amountValue(value: string) {
  const clean = value.replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function last4(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function normalizeRow(row: CsvRecord, suppliedAccountLast4: string): NormalizedRow | null {
  const transactionDate = dateValue(pick(row, ["transactiondate", "txndate", "date", "postingdate"]));
  if (!transactionDate) return null;
  const credit = amountValue(pick(row, ["credit", "creditamount", "deposit", "depositamount"]));
  const debit = amountValue(pick(row, ["debit", "debitamount", "withdrawal", "withdrawalamount"]));
  const signed = amountValue(pick(row, ["amount", "transactionamount", "txnamount"]));
  const type = pick(row, ["type", "transactiontype", "drcr", "creditdebit"]).toLowerCase();
  let direction: "credit" | "debit";
  let amount: number;
  if (credit !== null && credit > 0) {
    direction = "credit";
    amount = credit;
  } else if (debit !== null && debit > 0) {
    direction = "debit";
    amount = debit;
  } else if (signed !== null && signed !== 0) {
    direction = /debit|withdrawal|\bdr\b/.test(type) || signed < 0 ? "debit" : "credit";
    amount = Math.abs(signed);
  } else return null;
  return {
    transactionDate,
    valueDate: dateValue(pick(row, ["valuedate"])) || null,
    direction,
    amountPaise: Math.round(amount * 100),
    description: pick(row, ["description", "narration", "remarks", "particulars", "details"]),
    reference: pick(row, ["reference", "referencenumber", "utr", "utrnumber", "chequenumber"]),
    statementAccountLast4: last4(pick(row, ["accountnumber", "accountno", "account"])) || suppliedAccountLast4,
    counterpartyAccountLast4: last4(pick(row, ["counterpartyaccount", "senderaccount", "beneficiaryaccount", "fromaccount", "toaccount"])),
  };
}

async function fingerprint(row: NormalizedRow) {
  const payload = [row.statementAccountLast4, row.transactionDate, row.direction, row.amountPaise, row.reference, row.description].join("|").toLowerCase();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function searchable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user) return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("statement");
  const suppliedAccountLast4 = String(form?.get("statementAccountLast4") || "").replace(/\D/g, "").slice(-4);
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv"))
    return NextResponse.json({ message: "Upload a CSV bank statement." }, { status: 400 });
  if (file.size > 1024 * 1024)
    return NextResponse.json({ message: "The statement must be 1 MB or smaller." }, { status: 400 });
  if (!/^\d{4}$/.test(suppliedAccountLast4))
    return NextResponse.json({ message: "Enter the business account’s last four digits." }, { status: 400 });
  const raw = getRawDb();
  const profile = await raw
    .prepare("SELECT account_number FROM business_profiles WHERE owner_user_id = ? LIMIT 1")
    .bind(user.id)
    .first<Record<string, unknown>>();
  const configuredLast4 = last4(String(profile?.account_number || ""));
  if (configuredLast4 && configuredLast4 !== suppliedAccountLast4)
    return NextResponse.json(
      { message: "This statement account does not match the bank account in Business Profile." },
      { status: 400 },
    );
  const parsed = parseCsv(await file.text()).slice(0, 500);
  const rows = parsed.map((row) => normalizeRow(row, suppliedAccountLast4)).filter((row): row is NormalizedRow => Boolean(row));
  if (!rows.length)
    return NextResponse.json({ message: "No valid transactions were found. Check the CSV headings and date/amount columns." }, { status: 400 });

  const batchId = crypto.randomUUID();
  let matchedCount = 0;
  let reviewCount = 0;
  let unmatchedCount = 0;
  let duplicateCount = 0;
  const now = Date.now();
  for (const row of rows) {
    const rowFingerprint = await fingerprint(row);
    const existing = await raw
      .prepare("SELECT id FROM bank_transactions WHERE owner_user_id = ? AND fingerprint = ? LIMIT 1")
      .bind(user.id, rowFingerprint)
      .first();
    if (existing) {
      duplicateCount += 1;
      continue;
    }
    let status = "unmatched";
    let matchConfidence: string | null = null;
    let matchReason = row.direction === "debit" ? "Debit imported for review; automatic invoice settlement applies to incoming credits." : "No open invoice matched this amount.";
    let matchedEntityType: string | null = null;
    let matchedEntityId: string | null = null;
    let matchedEntityName: string | null = null;
    let invoiceUpdate: ReturnType<typeof raw.prepare> | null = null;
    const bankTransactionId = crypto.randomUUID();
    let journalStatements: Awaited<ReturnType<typeof prepareJournal>>["statements"] = [];

    if (row.statementAccountLast4 !== suppliedAccountLast4) {
      status = "review";
      matchConfidence = "low";
      matchReason = "The row account identifier differs from the selected business account.";
    } else if (row.direction === "credit") {
      const candidates = await raw
        .prepare(
          "SELECT i.id,i.invoice_number,i.customer_name,COALESCE(c.nickname,i.customer_name) AS summary_name,c.bank_account_last4 FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id AND c.owner_user_id = i.owner_user_id WHERE i.owner_user_id = ? AND i.status NOT IN ('paid','cancelled') AND (i.total_paise - i.paid_paise) = ? AND i.invoice_date <= ? AND julianday(?) - julianday(i.invoice_date) BETWEEN 0 AND 90 ORDER BY i.invoice_date DESC LIMIT 10",
        )
        .bind(user.id, row.amountPaise, row.transactionDate, row.transactionDate)
        .all<Record<string, unknown>>();
      const haystack = searchable(`${row.description} ${row.reference}`);
      const scored = (candidates.results || []).map((candidate) => {
        const invoiceNumber = String(candidate.invoice_number || "");
        const customerName = String(candidate.customer_name || "");
        const summaryName = String(candidate.summary_name || customerName);
        const accountMatch = Boolean(row.counterpartyAccountLast4 && row.counterpartyAccountLast4 === String(candidate.bank_account_last4 || ""));
        const referenceMatch = Boolean(invoiceNumber && haystack.includes(searchable(invoiceNumber)));
        const nameMatch = [customerName, summaryName].some((name) => searchable(name).length >= 4 && haystack.includes(searchable(name)));
        return { candidate, accountMatch, referenceMatch, nameMatch };
      });
      const strong = scored.filter((item) => item.referenceMatch || (item.accountMatch && item.nameMatch) || (item.accountMatch && scored.length === 1));
      if (strong.length === 1) {
        const match = strong[0];
        status = "matched";
        matchConfidence = "high";
        matchReason = match.referenceMatch
          ? "Exact amount and invoice reference matched within the date window."
          : "Exact amount and customer account matched within the date window.";
        matchedEntityType = "invoice";
        matchedEntityId = String(match.candidate.id);
        matchedEntityName = String(match.candidate.summary_name);
        invoiceUpdate = raw
          .prepare("UPDATE invoices SET paid_paise = total_paise,status = 'paid' WHERE id = ? AND owner_user_id = ? AND status NOT IN ('paid','cancelled')")
          .bind(matchedEntityId, user.id);
      } else if (scored.length) {
        status = "review";
        matchConfidence = "medium";
        matchReason = scored.length === 1
          ? "Amount and date match one invoice, but customer account or reference confirmation is missing."
          : "Multiple open invoices have the same amount in the date window.";
        if (scored.length === 1) {
          matchedEntityType = "invoice";
          matchedEntityId = String(scored[0].candidate.id);
          matchedEntityName = String(scored[0].candidate.summary_name);
        }
      }
    }
    if (status === "matched" && matchedEntityId) {
      try {
        await assertPeriodOpen(user.id, row.transactionDate);
        const journal = await prepareJournal({
          ownerUserId: user.id,
          actor: user.email,
          entryDate: row.transactionDate,
          sourceType: "bank_receipt",
          sourceId: bankTransactionId,
          description: `Customer payment received · ${matchedEntityName || matchedEntityId}`,
          lines: simpleEntry("money_in", row.amountPaise, { category: "customer_payment" }),
        });
        journalStatements = journal.statements;
      } catch (error) {
        if (error instanceof Error && error.message === "PERIOD_LOCKED") {
          status = "review";
          matchConfidence = "medium";
          matchReason = "The invoice matched, but the accounting period is locked. Review before posting.";
          invoiceUpdate = null;
        } else throw error;
      }
    }
    if (status === "matched") matchedCount += 1;
    else if (status === "review") reviewCount += 1;
    else unmatchedCount += 1;
    const insert = raw
      .prepare(
        "INSERT INTO bank_transactions (id,owner_user_id,import_batch_id,fingerprint,statement_account_last4,counterparty_account_last4,transaction_date,value_date,direction,amount_paise,description,reference,matched_entity_type,matched_entity_id,matched_entity_name,match_confidence,match_reason,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        bankTransactionId, user.id, batchId, rowFingerprint, row.statementAccountLast4,
        row.counterpartyAccountLast4, row.transactionDate, row.valueDate, row.direction,
        row.amountPaise, row.description || null, row.reference || null, matchedEntityType,
        matchedEntityId, matchedEntityName, matchConfidence, matchReason, status, now,
      );
    await raw.batch(invoiceUpdate ? [insert, invoiceUpdate, ...journalStatements] : [insert]);
  }
  const importedCount = rows.length - duplicateCount;
  await raw
    .prepare(
      "INSERT INTO bank_import_batches (id,owner_user_id,source_filename,statement_account_last4,imported_count,matched_count,review_count,unmatched_count,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .bind(batchId, user.id, file.name.slice(0, 180), suppliedAccountLast4, importedCount, matchedCount, reviewCount, unmatchedCount, now)
    .run();
  return NextResponse.json({ importedCount, matchedCount, reviewCount, unmatchedCount, duplicateCount });
}
