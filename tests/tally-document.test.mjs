import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load() {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync("app/lib/tally-document.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, TextEncoder },
  );
  return exports;
}
const { parseXml, documentFromNode } = load();

const RECEIPT = '<VOUCHER><GUID>receipt-one</GUID><DATE>20260909</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME><ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>';

test("a real voucher parses its ledger entries", () => {
  const doc = documentFromNode(parseXml(RECEIPT).children[0]);
  assert.equal(doc.ledgers.length, 2);
  assert.equal(doc.items.length, 0);
});

test("an empty placeholder inventory list on a non-item voucher is ignored, not treated as a malformed item", () => {
  const withEmptyPlaceholder = RECEIPT.replace("</VOUCHER>", "<ALLINVENTORYENTRIES.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>");
  const doc = documentFromNode(parseXml(withEmptyPlaceholder).children[0]);
  assert.equal(doc.items.length, 0);
  assert.equal(doc.ledgers.length, 2);
});

test("a partial LEDGERENTRIES.LIST alongside a complete ALLLEDGERENTRIES.LIST is ignored, not double-counted", () => {
  // Confirmed on a real GST sales voucher: LEDGERENTRIES.LIST omitted the sales ledger
  // that ALLLEDGERENTRIES.LIST included, so treating both as additive doubled every other
  // line and left the sales ledger's amount as the entire "not balanced" gap.
  const voucher = '<VOUCHER><GUID>gst-sale</GUID><DATE>20260909</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER><PARTYLEDGERNAME>Example party</PARTYLEDGERNAME>'
    + '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>-118</AMOUNT></ALLLEDGERENTRIES.LIST>'
    + '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST>'
    + '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Output IGST</LEDGERNAME><AMOUNT>18</AMOUNT></ALLLEDGERENTRIES.LIST>'
    + '<LEDGERENTRIES.LIST><LEDGERNAME>Example party</LEDGERNAME><AMOUNT>-118</AMOUNT></LEDGERENTRIES.LIST>'
    + '<LEDGERENTRIES.LIST><LEDGERNAME>Output IGST</LEDGERNAME><AMOUNT>18</AMOUNT></LEDGERENTRIES.LIST>'
    + '</VOUCHER>';
  const doc = documentFromNode(parseXml(voucher).children[0]);
  assert.equal(doc.ledgers.length, 3);
  assert.equal(doc.ledgers.reduce((sum, l) => sum + l.amount, 0), 0);
});

test("an ALLLEDGERENTRIES.LIST-only voucher (no plain list at all) still parses every line", () => {
  const doc = documentFromNode(parseXml(RECEIPT).children[0]);
  assert.equal(doc.ledgers.length, 2);
});
