COMMONS TALLYPRIME CONNECTOR — WINDOWS

Requirements: Windows 10/11, Python 3.11+ with Tcl/Tk and Python launcher,
TallyPrime installed on this PC, and internet access to Commons.
Download Python from https://www.python.org/downloads/windows/ if needed.

1. Extract this ZIP into a folder. Open Start Commons Connector.cmd.
2. In TallyPrime enable the HTTP server (normally port 9000), and open the
   company you want to connect. The connector only contacts 127.0.0.1.
3. Click Find Tally companies in the connector.
4. In Commons select your business, open Tally integration > Live sync,
   enter the EXACT discovered Tally name, and generate a connection key.
5. Paste the key into the connector and select the corresponding company.
   Choose the first date to receive, then click Connect & start.
6. The company identity is pinned on first connection. A different company
   or a restored company with a different GUID will be rejected.

SENDING
First import the Commons masters XML into the selected Tally company using
Send to Tally. Then use Live sync > Review outgoing vouchers. Approve the
displayed vouchers. The connector sends approved entries every 30 seconds.
Existing Tally-imported journal entries are excluded to prevent echo loops.
Missing ledgers block posting. Fix them in Tally and click Retry after fixing.
For Sending/Delivery uncertain click Check delivery; this NEVER reposts.
The connector reads back the voucher GUID and ledger amounts before success.
If the result remains uncertain, inspect that voucher in Tally before doing
any manual import. Do not repeatedly import the same voucher XML.

RECEIVING
The chosen date range is scanned one day per cycle, then scanned again.
Use a short range for quicker updates. Review incoming vouchers in Commons
Live sync > Transfer activity > Review voucher. Map unknown ledgers, preview,
and confirm the import. Supported sales, purchases and receipts now update
business records together with accounting. Supplied stock, warehouse and
batch allocations are imported, including machine-readable expiry dates.
Stock-out vouchers require an existing item with a purchase cost; amounts,
units and mixed tax details must reconcile before the import is accepted.
Revisions and cancellations return to review. Posted accounting and stock
history is reversed and retained before the replacement effects are applied.
Paid bills cannot be cancelled until their receipts are reversed.
Limits: 500 vouchers per receiving day, 64 KB per voucher, 4 MB per response.
Use manual XML exchange when a limit is exceeded; the connector reports it.

SCOPE
Outgoing transfers currently exchange accounting vouchers, not full inventory
invoices. Incoming supported voucher types connect business and accounting;
unsupported tax, currency, quantity and allocation variants stop for review.
IRN, acknowledgement and e-way-bill references supplied by Tally are preserved
in document history. This is NOT government submission or IRN validation.
Full master updates, automatic two-way posting, outbound stock and physical
voucher deletions remain outside this release. Start with a test company or
backed-up company and review the first transfer in both directions.
This package is a Python application, not a signed standalone Windows EXE.

KEYS AND RECOVERY
The connection key is encrypted for the current Windows user with DPAPI.
Local delivery recovery data is in %LOCALAPPDATA%\CommonsTallyConnector.
The key expires after 90 days. Generate a replacement in Commons and paste
it here. Disconnect in Commons revokes access immediately. The last saved
connection is remembered but does not auto-start after opening the app.
Only one connector window can run. Pause it before changing companies.
Uninstall: close the connector, revoke its key in Commons, and delete its
extracted folder. Preserve recovery data until all transfers are resolved.

References:
https://help.tallysolutions.com/pre-requisites-for-integrations/
https://help.tallysolutions.com/sample-xml/
https://help.tallysolutions.com/objects-and-collections/

Release compatibility
---------------------
Target installation: TallyPrime 7.0 directly on Windows.
Connector protocol: 2. Replace older connector files before reconnecting.
The web app rejects older senders because they do not verify bill allocations,
party identity, cancellation state or inventory quantities during read-back.

Standalone executable build
---------------------------
The repository includes .github/workflows/windows-connector.yml. Run the
"Build Windows connector" workflow in GitHub Actions after the repository is
connected. It tests the connector, builds a self-contained Windows folder and
smoke-tests Tk, DPAPI and SQLite. Download its acceptance ZIP, extract the
entire folder and open CommonsTallyConnector.exe. Python is not required on
that destination PC. The package is unsigned and is not a Windows installer.
No executable was built or tested in the Linux development environment.
The downloadable source ZIP still requires Python 3.11 or later.

Accounting validation
---------------------
Manual advanced item-invoice exports retain Commons stock-value/cost journals.
Reconcile inventory valuation in a separate Tally test company before use.
Do not import item and accounting versions of the same vouchers as separate
transactions. Live sync continues to send reviewed accounting vouchers only.
Consult docs/TALLY_RELEASE_GATES.md in the repository for the complete list of
unimplemented features and required external acceptance tests.
