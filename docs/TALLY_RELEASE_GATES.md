# Commons · TallyPrime 7.0 release status

Status: integration candidate; not approved for production accounting.
Target: TallyPrime 7.0 installed directly on Windows.
No real TallyPrime company, Windows executable, government endpoint or accountant sign-off has been tested in this environment. Passing simulated checks does not establish production compatibility.

## Implemented and covered by automated checks

- Account ownership and five-company isolation, including stale-tab write rejection.
- Hashed, expiring, revocable connector keys pinned to a Tally company identity.
- Reviewed accounting-voucher queue, durable acknowledgement recovery, no automatic repost after an uncertain delivery.
- Protocol 2 read-back checks cover parties, invoice references, bill allocations, stock quantities, batches and cancellation flags. Older senders are rejected.
- Connected incoming sales, purchases and bill-referenced customer receipts; stock movements and supplied batch history; reviewed revisions/cancellations and compensating accounting entries.
- Item-level accounting allocations, duplicate representation reconciliation, exact fixed-point amounts, calendar-date checks and bounded XML/JSON processing.
- Outgoing native sales invoice numbers, customer/supplier bill references, receipt allocations and saved sales GST components.
- Manual item-invoice XML export for validation, with quantities, HSN and accounting allocations. It is not used by the live queue.
- Correct customer/supplier opening-balance direction. Standard master exports omit openings; explicit opening exports must not be combined with matching opening journals.
- Generated demo data is excluded from Tally exports.
- A Windows executable build workflow with offline Tk/DPAPI/SQLite smoke tests and package checksums. It must still run on GitHub or Windows; no executable artifact is claimed here.
- Company data exports now include employee, ledger, GST and Tally revision/transfer records, with a payload checksum and explicit credential exclusions. Exports are not labelled restore-verified.
- Central journal validation rejects unsafe integers, negative/two-sided lines, invalid dates and locked periods. Demo replacement is committed as one batch.

## Features still missing or incomplete

| Area | Remaining work before production use |
| --- | --- |
| Inventory valuation | Reconcile Commons perpetual stock/COGS entries against the exact Tally integrated-inventory settings. Current item XML retains those accounting entries; importing into the wrong configuration may double-count valuation. |
| Native batches and warehouses | Native Commons bills do not yet have complete outbound batch/warehouse allocations. Incoming supplied allocations are retained. |
| Master synchronisation | Comprehensive master create/alter/rename/delete, GUID mapping, group hierarchies and conflict resolution in both directions. Current exports create masters; incoming voucher imports create only relevant missing parties/items. |
| Supplier balances and advances | Full purchase-level payment application/reversal and advance/on-account mappings. Current supplier payment accounting and stored references do not establish complete purchase-subledger parity. |
| Returns | Full original-bill allocation, tax correction, refund and receivable/payable reconciliation for every credit/debit-note scenario. |
| Outbound revisions and cancellations | Existing queue snapshots do not implement safe automatic edits/cancellations of already-sent Commons vouchers. Resolve these explicitly in both systems. |
| Physical deletions | No automatic delete propagation. Never infer deletion from a missing or incomplete daily scan. |
| Unattended two-way posting | No unattended incoming posting or automatic outgoing approval. Revisions stay reviewable; conflict and retry policies need real-system validation first. |
| GST | Purchase input-tax component mapping, complex tax/discount/freight/rounding cases, multi-item rate reconciliation and actual GSTR comparisons must be verified. |
| Government submissions | No live e-invoice, e-way-bill or GST-return submission integration. Tally-supplied identifiers are preserved; they are not independently government-validated. Provider onboarding, credentials, sandbox checks, status/retry handling and consent are required. |
| Other Tally modes | Custom voucher types, compound units, foreign currencies, manufacturing/stock journals, complex cost-centre allocations and payroll masters remain unsupported or incomplete. |
| Windows distribution | Workflow execution, Windows/Tally acceptance testing, code signing, installer/update mechanism and support process remain outstanding. The workflow builds a portable executable folder, not an installer. |
| Operational readiness | Independent accountant review; backup restoration drill; shared-team role enforcement (saved responsibility records currently do not grant company access); audit-chain concurrency/tamper review; load/soak tests; monitoring and incident runbook. These must not be inferred from unit tests. |

## Acceptance procedure on a separate test company

1. Back up the Tally company and Commons data. Restore the backups into a separate test environment and prove that restoration works.
2. Record the exact Tally release, company GUID, accounting period, inventory integration/valuation method, tax configuration, units and existing opening balances.
3. Build the Windows package, run its offline smoke test, and pair exactly one Commons test company to that Tally test company.
4. Reconcile opening trial balance, customer/supplier totals, stock quantity/value and GST balances before sending vouchers. Use either master opening balances or opening journals, not both.
5. Create and receive one representative sale, purchase, partial receipt, payment, credit note, debit note and return. Compare each business document, ledger movement, bill balance, tax figure and stock effect in both systems.
6. Repeat with multiple items/rates, multiple batches/warehouses, discounts, rounding, expiry and a changed voucher date. Unsupported cases must stop with a visible explanation and no partial posting.
7. Repeat a delivery; interrupt the connection after Tally accepts it; restart the connector; check uncertain delivery. Confirm that no duplicate voucher is created.
8. Revise and cancel imported documents. Test closed periods, paid-bill cancellation, changed party, stale alteration IDs and concurrent imports. Retain the full correction history.
9. Test a second Commons company, wrong Tally company, expired/revoked keys and an old browser tab. No action may cross company boundaries.
10. Reconcile trial balance, P&L, balance sheet, GST, stock valuation and all party subledgers. Obtain an independent accountant's recorded approval with the tested commit and configuration before enabling live accounting.

## Repository and hosting

The app currently depends on Sites/Cloudflare D1 and platform-issued identity headers. A GitHub repository stores source; creating it does not migrate the live database, authentication or deployment. Do not expose the Worker directly on a public host that accepts client-forged identity headers. A different hosting platform requires a separately implemented and verified authentication boundary.

No API keys, connector DPAPI files, local recovery databases or customer exports belong in Git.

## Primary technical references

- https://help.tallysolutions.com/pre-requisites-for-integrations/
- https://help.tallysolutions.com/sample-xml/
- https://pyinstaller.org/en/stable/operating-mode.html
