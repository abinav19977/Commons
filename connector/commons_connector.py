"""Commons TallyPrime connector. Python 3.11+, standard library only."""
import ctypes
from ctypes import wintypes
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import sqlite3
import sys
import threading
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

SITE = "https://commons.abinavshanker-k-252.workers.dev"
MAX_XML = 40_000_000
PROTOCOL_VERSION = 2

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Unexpected redirect. No credentials were forwarded.")

def parse_xml(data):
    text = data.decode("utf-8-sig") if isinstance(data, bytes) else data
    if re.search(r"<!DOCTYPE|<!ENTITY", text, re.I):
        raise ValueError("XML entity declarations are not accepted.")
    # Tally exports a legacy U+0004 marker which is not valid XML 1.0.
    text = re.sub(r"&#(?:0*[0-8]|0*1[124-9]|0*2[0-9]|0*3[01]);", "", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    # Some Tally companies emit prefixed tags/attributes (e.g. UDF:...) with no matching
    # xmlns declaration in scope, which the XML parser rejects ("unbound prefix") and
    # aborts an entire history pull. Commons never reads namespaces, so drop them.
    def plain_tag(match):
        tag = match.group(0)
        if tag.startswith(("<?", "<!")): return tag
        tag = re.sub(r"""\s+xmlns(?::[\w.-]+)?\s*=\s*("[^"]*"|'[^']*')""", "", tag)
        tag = re.sub(r"^(</?)([\w.-]+):(?=[\w.-])", lambda m: m.group(1) + m.group(2) + "_", tag)
        return re.sub(r"(\s)([\w.-]+):([\w.-]+)(\s*=)", lambda m: m.group(1) + m.group(2) + "_" + m.group(3) + m.group(4), tag)
    text = re.sub(r"<[^<>]+>", plain_tag, text)
    root = ET.fromstring(text)
    error = root.findtext(".//LINEERROR") or root.findtext(".//ERROR")
    if error or root.findtext(".//STATUS") == "0":
        raise ValueError(error or "Tally rejected the request.")
    return root

def collection_xml(kind, company="", start=None, end=None, voucher_type=None):
    root = ET.Element("ENVELOPE")
    header = ET.SubElement(root, "HEADER")
    for name, value in [("VERSION", "1"), ("TALLYREQUEST", "Export"), ("TYPE", "Collection"), ("ID", "CommonsCollection")]:
        ET.SubElement(header, name).text = value
    desc = ET.SubElement(ET.SubElement(root, "BODY"), "DESC")
    variables = ET.SubElement(desc, "STATICVARIABLES")
    ET.SubElement(variables, "SVEXPORTFORMAT").text = "$$SysName:XML"
    if company:
        ET.SubElement(variables, "SVCURRENTCOMPANY").text = company
    if start:
        ET.SubElement(variables, "SVFROMDATE", {"TYPE": "Date"}).text = start.replace("-", "")
        ET.SubElement(variables, "SVTODATE", {"TYPE": "Date"}).text = (end or start).replace("-", "")
    message = ET.SubElement(ET.SubElement(desc, "TDL"), "TDLMESSAGE")
    coll = ET.SubElement(message, "COLLECTION", {"NAME": "CommonsCollection", "ISMODIFY": "No"})
    ET.SubElement(coll, "TYPE").text = kind
    ET.SubElement(coll, "FETCH").text = "Name,GUID" if kind == "Company" else "Name" if kind == "Ledger" else "*"
    if kind == "Company":
        # Company is not a normal master collection in every TallyPrime build.
        # Native methods make the fields explicit for releases that otherwise
        # return an empty COMPANY element.
        ET.SubElement(coll, "NATIVEMETHOD").text = "Name,GUID"
    if kind == "Voucher":
        # FETCH:* silently drops nested ledger-entry list objects for plain
        # accounting vouchers (Receipt/Payment/Journal) on some TallyPrime
        # builds, even though it already returns nested inventory lists fine.
        # Only ask for the ledger ones: also requesting the inventory list
        # names here makes Tally emit an empty placeholder tag for vouchers
        # with no items, which the item parser cannot distinguish from a
        # real (malformed) line.
        ET.SubElement(coll, "NATIVEMETHOD").text = "ALLLEDGERENTRIES.LIST,LEDGERENTRIES.LIST"
    if start and kind == "Voucher":
        condition = "$Date >= ##SVFromDate AND $Date <= ##SVToDate"
        if voucher_type:
            condition += ' AND $VoucherTypeName = "' + voucher_type.replace('"', '\\"') + '"'
        ET.SubElement(coll, "FILTERS").text = "CommonsDates"
        ET.SubElement(message, "SYSTEM", {"TYPE": "Formulae", "NAME": "CommonsDates"}).text = condition
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

def voucher_types_xml(company=""):
    """List every voucher type name (built-in and custom) this company actually uses,
    so a too-large day can be split automatically by real type names instead of a
    hardcoded guess."""
    root = ET.Element("ENVELOPE")
    header = ET.SubElement(root, "HEADER")
    for name, value in [("VERSION", "1"), ("TALLYREQUEST", "Export"), ("TYPE", "Collection"), ("ID", "CommonsVoucherTypes")]:
        ET.SubElement(header, name).text = value
    desc = ET.SubElement(ET.SubElement(root, "BODY"), "DESC")
    variables = ET.SubElement(desc, "STATICVARIABLES")
    ET.SubElement(variables, "SVEXPORTFORMAT").text = "$$SysName:XML"
    if company:
        ET.SubElement(variables, "SVCURRENTCOMPANY").text = company
    message = ET.SubElement(ET.SubElement(desc, "TDL"), "TDLMESSAGE")
    coll = ET.SubElement(message, "COLLECTION", {"NAME": "CommonsVoucherTypes", "ISMODIFY": "No"})
    ET.SubElement(coll, "TYPE").text = "VoucherType"
    ET.SubElement(coll, "FETCH").text = "Name"
    ET.SubElement(coll, "NATIVEMETHOD").text = "NAME"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

def masters_xml(kind, company=""):
    """Export Group/Ledger/StockItem masters so Commons can auto-map ledgers by their
    Tally group and pre-fill stock-item unit/GST rate/cost, instead of needing a manual
    ledger-mapping spreadsheet for every company."""
    root = ET.Element("ENVELOPE")
    header = ET.SubElement(root, "HEADER")
    for name, value in [("VERSION", "1"), ("TALLYREQUEST", "Export"), ("TYPE", "Collection"), ("ID", "CommonsMasters" + kind)]:
        ET.SubElement(header, name).text = value
    desc = ET.SubElement(ET.SubElement(root, "BODY"), "DESC")
    variables = ET.SubElement(desc, "STATICVARIABLES")
    ET.SubElement(variables, "SVEXPORTFORMAT").text = "$$SysName:XML"
    if company:
        ET.SubElement(variables, "SVCURRENTCOMPANY").text = company
    message = ET.SubElement(ET.SubElement(desc, "TDL"), "TDLMESSAGE")
    coll = ET.SubElement(message, "COLLECTION", {"NAME": "CommonsMasters" + kind, "ISMODIFY": "No"})
    ET.SubElement(coll, "TYPE").text = kind
    # Group/Ledger masters can run into the thousands; a full FETCH:* export of every
    # field exceeds the 4 MB response cap. Naming exactly the fields needed keeps each
    # StockItem record to a few KB instead of 20-30+ KB (confirmed: the full company's GST
    # detail fits in ~1 MB total this way, well under the cap, in under 6 seconds).
    if kind == "StockItem":
        fetch, native = "Name,Parent,Baseunits,Openingrate,Gstdetails", "NAME,PARENT,BASEUNITS,OPENINGRATE,GSTDETAILS.LIST,STATEWISEDETAILS.LIST,RATEDETAILS.LIST"
    else:
        fetch, native = "Name,Parent", "NAME,PARENT"
    ET.SubElement(coll, "FETCH").text = fetch
    ET.SubElement(coll, "NATIVEMETHOD").text = native
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

def ledger_balances_xml(company, start, end):
    """Opening (at books-start) and closing (today) balance of every ledger. Kept as its own
    request: Tally has to compute these over the whole period and answers one request at a
    time, so bundling it with the quick masters call made connecting look frozen."""
    root = ET.Element("ENVELOPE")
    header = ET.SubElement(root, "HEADER")
    for name, value in [("VERSION", "1"), ("TALLYREQUEST", "Export"), ("TYPE", "Collection"), ("ID", "CommonsLedgerBalances")]:
        ET.SubElement(header, name).text = value
    desc = ET.SubElement(ET.SubElement(root, "BODY"), "DESC")
    variables = ET.SubElement(desc, "STATICVARIABLES")
    ET.SubElement(variables, "SVEXPORTFORMAT").text = "$$SysName:XML"
    ET.SubElement(variables, "SVCURRENTCOMPANY").text = company
    ET.SubElement(variables, "SVFROMDATE").text = start.strftime("%Y%m%d")
    ET.SubElement(variables, "SVTODATE").text = end.strftime("%Y%m%d")
    message = ET.SubElement(ET.SubElement(desc, "TDL"), "TDLMESSAGE")
    coll = ET.SubElement(message, "COLLECTION", {"NAME": "CommonsLedgerBalances", "ISMODIFY": "No"})
    ET.SubElement(coll, "TYPE").text = "Ledger"
    ET.SubElement(coll, "FETCH").text = "Name,Openingbalance,Closingbalance"
    ET.SubElement(coll, "NATIVEMETHOD").text = "NAME,OPENINGBALANCE,CLOSINGBALANCE"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

def company_collection_xml():
    """Export the loaded primary-company objects used by Tally's Company table."""
    root = ET.Element("ENVELOPE")
    header = ET.SubElement(root, "HEADER")
    for name, value in [("VERSION", "1"), ("TALLYREQUEST", "Export"), ("TYPE", "Collection"), ("ID", "CommonsCompanies")]:
        ET.SubElement(header, name).text = value
    desc = ET.SubElement(ET.SubElement(root, "BODY"), "DESC")
    variables = ET.SubElement(desc, "STATICVARIABLES")
    ET.SubElement(variables, "SVEXPORTFORMAT").text = "$$SysName:XML"
    message = ET.SubElement(ET.SubElement(desc, "TDL"), "TDLMESSAGE")
    coll = ET.SubElement(message, "COLLECTION", {"NAME": "CommonsCompanies", "ISMODIFY": "No"})
    ET.SubElement(coll, "SOURCECOLLECTION").text = "List of Primary Companies"
    ET.SubElement(coll, "FETCH").text = "Name,GUID"
    ET.SubElement(coll, "NATIVEMETHOD").text = "Name,GUID"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

def books_from_xml(company):
    """The date this company's books actually start from, straight from Tally --
    removes the one manual "receive from" date the connector used to require."""
    root = ET.Element("ENVELOPE")
    header = ET.SubElement(root, "HEADER")
    for name, value in [("VERSION", "1"), ("TALLYREQUEST", "Export"), ("TYPE", "Collection"), ("ID", "CommonsBooksFrom")]:
        ET.SubElement(header, name).text = value
    desc = ET.SubElement(ET.SubElement(root, "BODY"), "DESC")
    variables = ET.SubElement(desc, "STATICVARIABLES")
    ET.SubElement(variables, "SVEXPORTFORMAT").text = "$$SysName:XML"
    message = ET.SubElement(ET.SubElement(desc, "TDL"), "TDLMESSAGE")
    coll = ET.SubElement(message, "COLLECTION", {"NAME": "CommonsBooksFrom", "ISMODIFY": "No"})
    ET.SubElement(coll, "TYPE").text = "Company"
    ET.SubElement(coll, "FETCH").text = "Name,Booksfrom"
    ET.SubElement(coll, "NATIVEMETHOD").text = "NAME,BOOKSFROM"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

def company_rows(root):
    """Read company identity from the XML shapes emitted by TallyPrime."""
    def local(tag):
        return tag.rsplit("}", 1)[-1].upper()
    def field(node, names):
        names = set(names)
        for key, value in node.attrib.items():
            if local(key) in names and value and value.strip():
                return value.strip()
        for child in node.iter():
            if child is not node and local(child.tag) in names and child.text and child.text.strip():
                return child.text.strip()
        return ""
    rows = []
    for node in root.iter():
        tag = local(node.tag)
        if tag not in {"COMPANY", "CMPINFO", "COMPANYINFO"}:
            continue
        name = field(node, {"NAME", "COMPANYNAME"})
        if not name and tag == "COMPANY" and len(node) == 0 and node.text:
            name = node.text.strip()
        guid = field(node, {"GUID", "COMPANYGUID", "CMPGUID"})
        if name and guid:
            rows.append((name, guid))
    # Preserve Tally's order while removing repeated report/collection nodes.
    return list(dict.fromkeys(rows))

def identity(voucher):
    return voucher.findtext("GUID") or ""

def signature(voucher):
    """Compare financial meaning, including allocations, rather than ledger totals alone."""
    from decimal import Decimal
    def clean(value): return (value or "").strip()
    def amount(node, tag="AMOUNT"):
        number = Decimal(clean(node.findtext(tag) or "0").replace(",", ""))
        if not number.is_finite(): raise ValueError("Invalid numeric value returned by Tally.")
        return number
    def quantity(node, tag):
        text = clean(node.findtext(tag))
        if not text: return None
        match = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s+(.+)", text)
        if not match: raise ValueError("Unsupported quantity returned by Tally.")
        return (Decimal(match[1]), clean(match[2]))
    # TallyPrime often returns the same lines under both an "ALL..." tag and its plain
    # counterpart (the plain one can be a partial subset), plus empty placeholder tags.
    # Use the first tag that actually has content; adding them all makes every voucher
    # look different from what was sent.
    def first_populated(tags, key):
        for tag in tags:
            found = [n for n in voucher.findall(tag) if clean(n.findtext(key))]
            if found: return found
        return []
    ledgers = []
    for entry in first_populated(["ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"], "LEDGERNAME"):
        bills = sorted((clean(b.findtext("NAME")), clean(b.findtext("BILLTYPE")).lower(), amount(b)) for b in entry.findall("BILLALLOCATIONS.LIST") if clean(b.findtext("NAME")))
        ledgers.append((clean(entry.findtext("LEDGERNAME")), amount(entry), tuple(bills)))
    items = []
    for item in first_populated(["ALLINVENTORYENTRIES.LIST", "INVENTORYENTRIES.LIST", "INVENTORYENTRIESIN.LIST", "INVENTORYENTRIESOUT.LIST"], "STOCKITEMNAME"):
        allocations = sorted((clean(a.findtext("LEDGERNAME")), amount(a)) for a in item.findall("ACCOUNTINGALLOCATIONS.LIST"))
        batches = sorted((clean(b.findtext("GODOWNNAME")), clean(b.findtext("BATCHNAME")), quantity(b,"ACTUALQTY") or quantity(b,"BILLEDQTY"), amount(b), clean(b.findtext("MFDON")), clean(b.findtext("EXPIRYPERIOD"))) for b in item.findall("BATCHALLOCATIONS.LIST"))
        actual = quantity(item,"ACTUALQTY") or quantity(item,"BILLEDQTY")
        billed = quantity(item,"BILLEDQTY") or actual
        items.append((clean(item.findtext("STOCKITEMNAME")), actual, billed, amount(item), tuple(allocations), tuple(batches)))
    fields = tuple(clean(voucher.findtext(tag)) for tag in ["DATE","VOUCHERTYPENAME","VOUCHERNUMBER","PARTYLEDGERNAME","PARTYGSTIN","PLACEOFSUPPLY","REFERENCE"])
    flags = tuple(clean(voucher.findtext(tag)).lower()=="yes" for tag in ["ISCANCELLED","ISOPTIONAL"])
    return (fields, flags, sorted(ledgers), sorted(items))

def balance_paise(text):
    """Tally ledger balance text to signed paise, credit-positive (Tally writes debits as
    negative numbers; some builds append Dr/Cr instead)."""
    from decimal import Decimal, InvalidOperation
    text = (text or "").strip().replace(",", "")
    if not text: return None
    sign = 1
    if text.lower().endswith("dr"): sign, text = -1, text[:-2].strip()
    elif text.lower().endswith("cr"): sign, text = 1, text[:-2].strip()
    try: value = Decimal(text)
    except InvalidOperation: return None
    if not value.is_finite(): return None
    return int((value * sign * 100).to_integral_value())

def describe_difference(sent, stored):
    """Say which part of a voucher Tally stored differently (names and amounts only)."""
    parts = []
    if sent[0] != stored[0]: parts.append("header fields sent %s, Tally has %s" % (sent[0], stored[0]))
    if sent[1] != stored[1]: parts.append("cancelled/optional flags differ")
    if sent[2] != stored[2]: parts.append("ledger lines sent %s, Tally has %s" % ([(n, str(a)) for n, a, _ in sent[2]], [(n, str(a)) for n, a, _ in stored[2]]))
    if sent[3] != stored[3]: parts.append("stock items differ")
    return "; ".join(parts)[:600] or "unknown difference"

MAX_VOUCHER_BYTES = 400_000

def slim_voucher_xml(voucher):
    """Serialise a voucher without Tally's empty padding. TallyPrime pads every voucher with
    hundreds of empty tags (a single-item voucher is ~27 KB), so an invoice with many lines
    passed the old 64 KB limit and was silently skipped. Empty elements carry no data --
    Commons reads a missing tag and an empty one identically -- so dropping them is lossless."""
    def prune(node):
        node.text = (node.text or "").strip() or None
        for child in list(node):
            prune(child)
            child.tail = None
            if len(child) == 0 and not (child.text or "").strip():
                node.remove(child)
    copy = ET.fromstring(ET.tostring(voucher, encoding="unicode"))
    prune(copy)
    return ET.tostring(copy, encoding="unicode")

class Transport:
    def __init__(self, token, port=9000):
        if not 1024 <= int(port) <= 65535:
            raise ValueError("Choose a Tally port between 1024 and 65535.")
        self.token = token
        self.local_url = "http://127.0.0.1:" + str(int(port))
        self.cloud = urllib.request.build_opener(NoRedirect())
        # Never pass local Tally data through an environment HTTP proxy.
        self.local = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def tally(self, xml):
        request = urllib.request.Request(self.local_url, data=xml if isinstance(xml, bytes) else xml.encode("utf-8"), headers={"Content-Type": "text/xml; charset=utf-8"})
        with self.local.open(request, timeout=180) as response:
            data = response.read(MAX_XML + 1)
        if len(data) > MAX_XML:
            raise ValueError(f"Tally response exceeds {MAX_XML // 1_000_000} MB. Narrow the receiving period.")
        return parse_xml(data)

    def api(self, payload):
        # Python's default User-Agent ("Python-urllib/x.y") is blocked by Cloudflare's
        # bot protection on the deployed domain (error 1010); identify honestly instead.
        request = urllib.request.Request(SITE + "/api/integrations/tally/connector", data=json.dumps({**payload,"protocolVersion":PROTOCOL_VERSION},ensure_ascii=False).encode(), headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json", "User-Agent": "CommonsTallyConnector/" + str(PROTOCOL_VERSION)})
        try:
            with self.cloud.open(request, timeout=30) as response:
                data = response.read(200001)
            if len(data)>200000: raise ValueError("Commons response exceeds its size limit.")
            return json.loads(data)
        except urllib.error.HTTPError as error:
            try:
                message = json.loads(error.read(2000)).get("message", "Connection rejected.")
            except (ValueError, UnicodeError):
                message = "Commons rejected the connection. Check the published app and connection key."
            raise ValueError(message) from None

    def companies(self):
        errors = []
        for request in (company_collection_xml(), collection_xml("Company")):
            try:
                rows = company_rows(self.tally(request))
                if rows:
                    return rows
            except Exception as error:
                errors.append(str(error))
        detail = (" Last response: " + errors[-1]) if errors else ""
        raise ValueError(
            "Tally is reachable, but it did not return an open company with a stable GUID. "
            "Open the company at Gateway of Tally, then try again." + detail
        )

    def books_from(self, company):
        root = self.tally(books_from_xml(company))
        for node in root.iter("COMPANY"):
            name = (node.attrib.get("NAME") or node.findtext("NAME") or "").strip()
            if name != company:
                continue
            raw_date = (node.findtext("BOOKSFROM") or "").strip()
            if re.fullmatch(r"\d{8}", raw_date):
                return dt.date(int(raw_date[0:4]), int(raw_date[4:6]), int(raw_date[6:8]))
        return None

    def ledger_balances(self, company, start, end):
        return self.tally(ledger_balances_xml(company, start, end)).findall(".//LEDGER")

    def masters(self, company):
        return {
            "groups": self.tally(masters_xml("Group", company)).findall(".//GROUP"),
            "ledgers": self.tally(masters_xml("Ledger", company)).findall(".//LEDGER"),
            "stockitems": self.tally(masters_xml("StockItem", company)).findall(".//STOCKITEM"),
        }

    def voucher_types(self, company):
        root = self.tally(voucher_types_xml(company))
        names = set()
        for node in root.iter("VOUCHERTYPE"):
            name = (node.attrib.get("NAME") or node.findtext("NAME") or "").strip()
            if name:
                names.add(name)
        return sorted(names)

    def vouchers(self, company, start, end=None):
        end = end or start
        try:
            root = self.tally(collection_xml("Voucher", company, start, end))
            if root.find(".//COLLECTION") is None:
                raise ValueError("Tally did not return a voucher collection. No voucher was sent.")
            # Scoped to COLLECTION children only: an unscoped ".//VOUCHER" also matches
            # the unrelated <CMPINFO><VOUCHER>0</VOUCHER></CMPINFO> counter that Tally
            # includes in every response, which has no fields and no GUID.
            return root.findall(".//COLLECTION/VOUCHER")
        except ValueError as error:
            if "response exceeds" not in str(error):
                raise
            # This range can outgrow the 4 MB response cap. Split automatically by the
            # company's own real voucher types instead -- still covers every voucher,
            # just in smaller requests.
            collected, seen = [], set()
            for voucher_type in self.voucher_types(company):
                try:
                    type_root = self.tally(collection_xml("Voucher", company, start, end, voucher_type))
                    type_vouchers = type_root.findall(".//COLLECTION/VOUCHER")
                except ValueError as type_error:
                    if "response exceeds" not in str(type_error):
                        raise
                    # Even one voucher type for this whole range is too big -- fall back
                    # to day-by-day for just that type (recursion bottoms out at single
                    # days, which cannot be split further).
                    if start == end:
                        raise
                    type_vouchers = []
                    day = dt.datetime.strptime(start, "%Y-%m-%d").date()
                    last = dt.datetime.strptime(end, "%Y-%m-%d").date()
                    while day <= last:
                        day_root = self.tally(collection_xml("Voucher", company, day.isoformat(), day.isoformat(), voucher_type))
                        type_vouchers.extend(day_root.findall(".//COLLECTION/VOUCHER"))
                        day += dt.timedelta(days=1)
                for voucher in type_vouchers:
                    key = identity(voucher) or ET.tostring(voucher, encoding="unicode")
                    if key not in seen:
                        seen.add(key)
                        collected.append(voucher)
            return collected

class Connector:
    def __init__(self, transport, company, guid, database):
        self.transport, self.company, self.guid = transport, company, guid
        self.db = sqlite3.connect(database)
        self.db.execute("CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, status TEXT NOT NULL, message TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS received (scope TEXT, guid TEXT, digest TEXT, PRIMARY KEY(scope,guid))")
        self.scope = company + ":" + guid
        self.masters_pushed = False
        self.balance_note = ""
        self.skipped = []

    def call(self, action, **payload):
        return self.transport.api({"action": action, "name": self.company, "guid": self.guid, **payload})

    def verify_company(self):
        if [guid for name,guid in self.transport.companies() if name==self.company] != [self.guid]:
            raise ValueError("The paired Tally company is not open, or its identity has changed.")

    def flush_results(self):
        for row in self.db.execute("SELECT id,status,message FROM results").fetchall():
            self.call("ack", id=row[0], status=row[1], message=row[2])
            self.db.execute("DELETE FROM results WHERE id=?", (row[0],))
            self.db.commit()

    def deliver(self, job):
        attempted = False
        try:
            if hashlib.sha256(job["xml"].encode()).hexdigest() != job["digest"]:
                raise ValueError("Transfer integrity check failed.")
            root = parse_xml(job["xml"])
            vouchers = root.findall(".//VOUCHER")
            if len(vouchers) != 1 or root.findtext(".//SVCURRENTCOMPANY") != self.company:
                raise ValueError("Transfer does not match the selected company.")
            voucher = vouchers[0]
            if identity(voucher) != job["source_key"]:
                raise ValueError("Voucher identity mismatch.")
            day = dt.datetime.strptime(voucher.findtext("DATE"), "%Y%m%d").date().isoformat()
            self.verify_company()
            def find_existing():
                return [v for v in self.transport.vouchers(self.company, day) if identity(v) == job["source_key"] or v.attrib.get("REMOTEID") == "commons:" + job["source_key"] or v.findtext("REMOTEID") == "commons:" + job["source_key"]]
            found = find_existing()
            if found:
                if len(found) != 1 or signature(found[0]) != signature(voucher):
                    return "uncertain", "The voucher exists in Tally but differs: " + describe_difference(signature(voucher), signature(found[0]))
                return "sent", "Verified in Tally. No duplicate was created."
            if job.get("checkOnly"):
                return "uncertain", "Voucher not found in the paired Tally company. No automatic repost was attempted."
            ledger_root = self.transport.tally(collection_xml("Ledger", self.company))
            names = {v.attrib.get("NAME") or v.findtext("NAME") for v in ledger_root.findall(".//LEDGER")}
            needed = {v.text for v in voucher.findall(".//LEDGERNAME")}
            if needed - names:
                return "blocked", "Required ledgers are missing. Import Commons masters in Tally, then retry."
            items = {v.text for v in voucher.findall(".//STOCKITEMNAME")}
            if items:
                stock_root = self.transport.tally(collection_xml("StockItem", self.company))
                available = {v.attrib.get("NAME") or v.findtext("NAME") for v in stock_root.findall(".//STOCKITEM")}
                if items - available:
                    return "blocked", "Required stock items are missing. Import and verify the stock masters first."
            # Persist the uncertain state BEFORE the external write. A crash can never silently requeue it.
            self.db.execute("INSERT OR REPLACE INTO results VALUES (?,?,?)", (job["id"], "uncertain", "Transfer interrupted. Check delivery before any repost."))
            self.db.commit()
            attempted = True
            result = self.transport.tally(job["xml"])
            if result.findtext(".//CREATED") != "1" or int(result.findtext(".//ERRORS") or "0"):
                return "uncertain", "Tally did not confirm exactly one created voucher. Check delivery."
            found = find_existing()
            if len(found) != 1:
                return "uncertain", "Tally accepted the request but the voucher could not be read back. Check delivery."
            if signature(found[0]) != signature(voucher):
                return "uncertain", "Tally accepted the request but stored it differently: " + describe_difference(signature(voucher), signature(found[0]))
            return "sent", "Created and verified in Tally."
        except Exception as error:
            return ("uncertain" if attempted or job.get("checkOnly") else "blocked"), str(error)[:400]

    def push_masters(self):
        """Send Tally's Group/Ledger/StockItem masters to Commons once per run so ledger
        mapping and stock-item GST rate/cost are resolved automatically instead of by hand."""
        data = self.transport.masters(self.company)
        def field(node, name):
            child = node.find(name)
            return (child.text or "").strip() if child is not None and child.text else ""
        def name_of(node):
            return (node.attrib.get("NAME") or field(node, "NAME")).strip()
        group_parent = {}
        for group in data["groups"]:
            name = name_of(group)
            if name:
                group_parent[name] = field(group, "PARENT")
        # Tally's own reserved groups (Bank Accounts, Sundry Debtors, Duties & Taxes, ...)
        # are themselves nested under broader ones (Current Assets, Current Liabilities),
        # so walking all the way to the ultimate root loses the specific group Commons
        # actually maps. Stop at the nearest ancestor Commons recognises instead.
        reserved_groups = {
            "bank accounts", "cash-in-hand", "sundry debtors", "stock-in-hand", "sundry creditors",
            "sales accounts", "direct incomes", "indirect incomes", "purchase accounts",
            "direct expenses", "indirect expenses", "capital account", "reserves & surplus",
            "fixed assets", "duties & taxes",
            # Also standard (built-in) Tally subgroups, confirmed against a real company's
            # group export: an overdraft account behaves like a bank ledger for posting
            # purposes, and Provisions (e.g. "Wage Payable", "GST Payable" custom groups
            # nest under it) has a direct Commons equivalent.
            "bank od a/c", "provisions",
            # Broad standard groups (custom sub-groups nest under these); Commons has a catch-all
            # account for each, so ledgers here no longer need a manual choice.
            "current assets", "current liabilities", "loans & advances (asset)", "deposits (asset)",
            "investments", "loans (liability)", "secured loans", "unsecured loans",
        }
        def top_group(name):
            seen, current = set(), name
            while current:
                if current.strip().lower() in reserved_groups:
                    return current
                if current in seen or current not in group_parent:
                    return ""
                seen.add(current)
                current = group_parent[current]
            return ""
        ledgers = []
        for ledger in data["ledgers"]:
            name = name_of(ledger)
            if not name:
                continue
            parent = field(ledger, "PARENT")
            ledgers.append({"name": name, "topGroup": top_group(parent) if parent else ""})
        def gst_rate_basis_points(node):
            # A stock item can carry several GSTDETAILS.LIST entries, one per date its
            # rate last changed (APPLICABLEFROM) -- only the most recent one is the rate
            # actually in effect now. Each has its own STATEWISEDETAILS.LIST/RATEDETAILS.LIST
            # per duty head (CGST/SGST/UTGST/IGST/Cess); IGST alone already represents the
            # full combined rate, so prefer it and fall back to CGST+SGST if IGST is unset.
            entries = node.findall("GSTDETAILS.LIST")
            if not entries:
                return None
            latest = max(entries, key=lambda e: (e.findtext("APPLICABLEFROM") or ""))
            igst, split_total, seen = None, 0.0, set()
            for state in latest.findall("STATEWISEDETAILS.LIST"):
                for rate in state.findall("RATEDETAILS.LIST"):
                    head = (rate.findtext("GSTRATEDUTYHEAD") or "").strip().lower()
                    text = (rate.findtext("GSTRATE") or "").strip()
                    if not head or not text:
                        continue
                    try:
                        rate_value = float(text)
                    except ValueError:
                        continue
                    if head == "igst":
                        igst = rate_value
                    elif head in ("cgst", "sgst/utgst", "sgst") and head not in seen:
                        split_total += rate_value
                        seen.add(head)
                break  # only the first (company-wide "Any") state block is relevant here
            effective = igst if igst else split_total
            return round(effective * 100) if effective else None
        stockitems = []
        for item in data["stockitems"]:
            name = name_of(item)
            if not name:
                continue
            unit = field(item, "BASEUNITS")
            cost_paise = None
            match = re.match(r"([\d.]+)", field(item, "OPENINGRATE"))
            if match:
                try:
                    cost_paise = round(float(match.group(1)) * 100)
                except ValueError:
                    pass
            stockitems.append({"name": name, "unit": unit or None, "gstRateBasisPoints": gst_rate_basis_points(item), "costPaise": cost_paise})
        # Commons caps each connector request body at 100 KB; a company can have
        # thousands of ledgers/stock items, so send them in bounded chunks.
        chunk = 250
        for i in range(0, len(ledgers), chunk):
            self.call("masters", ledgers=ledgers[i:i + chunk], stockItems=[])
        for i in range(0, len(stockitems), chunk):
            self.call("masters", ledgers=[], stockItems=stockitems[i:i + chunk])

    def push_balances(self):
        """Send each ledger's opening/closing balance so Commons can post Tally's opening
        balances and show a ledger-by-ledger comparison."""
        books_from = self.transport.books_from(self.company)
        if not books_from:
            raise ValueError("Tally did not report when this company's books start.")
        nodes = self.transport.ledger_balances(self.company, books_from, dt.date.today())
        rows = []
        for node in nodes:
            name = (node.attrib.get("NAME") or node.findtext("NAME") or "").strip()
            if not name: continue
            entry = {"name": name}
            for key, tag in (("openingPaise", "OPENINGBALANCE"), ("closingPaise", "CLOSINGBALANCE")):
                paise = balance_paise(node.findtext(tag))
                if paise is not None: entry[key] = paise
            if len(entry) > 1: rows.append(entry)
        for i in range(0, len(rows), 250):
            self.call("masters", ledgers=rows[i:i + 250], stockItems=[], booksFrom=books_from.isoformat())
        return len(rows)

    def _balances_job(self):
        self.balance_note = "Reading Tally balances (this can take a few minutes)…"
        try:
            count = self.push_balances()
            self.balance_note = "Tally balances sent for %d ledgers." % count
        except Exception as error:
            self.balance_note = "Tally balances could not be read: %s" % str(error)[:160]

    def cycle(self, receiving_day=None):
        self.verify_company()
        if not self.masters_pushed:
            try:
                self.push_masters()
            except Exception:
                pass  # Master sync is best-effort; it must never block voucher sync.
            self.masters_pushed = True
        self.flush_results()
        job = self.call("poll").get("job")
        result = "Connected. No approved outgoing vouchers waiting."
        if job:
            status, message = self.deliver(job)
            self.db.execute("INSERT OR REPLACE INTO results VALUES (?,?,?)", (job["id"], status, message))
            self.db.commit()
            self.flush_results()
            result = status.capitalize() + ": " + message
        if receiving_day:
            incoming = self.transport.vouchers(self.company, receiving_day)
            if len(incoming) > 2000:
                raise ValueError("More than 2000 vouchers in this day. Run a full backfill instead.")
            count = self.push_vouchers(incoming)
            result += f" Received {count} new or changed vouchers for {receiving_day}."
        if self.balance_note:
            result += " " + self.balance_note
        return result

    def push_vouchers(self, vouchers):
        """Send only new-or-changed vouchers to Commons, batched up to 200 per request
        instead of one HTTP round trip per voucher -- this is what makes a company with
        a large history sync in minutes instead of hours. A single oversized voucher is
        skipped (and reported via self.skipped) rather than stopping the whole batch --
        one unusually large voucher should never block hundreds of ordinary ones."""
        to_send = []
        for voucher in vouchers:
            guid = identity(voucher)
            if not guid:
                raise ValueError("Incoming voucher has no stable GUID. Receive stopped for review.")
            xml = ET.tostring(voucher, encoding="unicode")
            if len(xml.encode("utf-8")) > 64000:
                # Vouchers under the old limit keep their exact original text (and digest) so
                # nothing already received looks "changed"; only the ones that used to be
                # skipped are shrunk.
                xml = slim_voucher_xml(voucher)
            if len(xml.encode("utf-8")) > MAX_VOUCHER_BYTES:
                self.skipped.append((guid, "Exceeds %d KB even after removing empty fields. Use manual XML import for this voucher." % (MAX_VOUCHER_BYTES // 1000)))
                continue
            value = hashlib.sha256(xml.encode()).hexdigest()
            prior = self.db.execute("SELECT digest FROM received WHERE scope=? AND guid=?", (self.scope, guid)).fetchone()
            if not prior or prior[0] != value:
                to_send.append((guid, value, xml))
        count = 0
        chunks, current, size = [], [], 0
        for item in to_send:
            item_size = len(item[2].encode("utf-8"))
            if current and (len(current) >= 100 or size + item_size > 4_000_000):
                chunks.append(current); current, size = [], 0
            current.append(item); size += item_size
        if current: chunks.append(current)
        for chunk in chunks:
            self.call("inbox_batch", items=[item[2] for item in chunk])
            for guid, value, _ in chunk:
                self.db.execute("INSERT OR REPLACE INTO received VALUES (?,?,?)", (self.scope, guid, value))
            self.db.commit()
            count += len(chunk)
        return count

    def backfill(self, since=None, until=None, progress=None):
        """One-time catch-up of the company's entire Tally history (or a given range),
        pulled in month-sized chunks (falling back automatically to smaller ones only
        when a chunk is too large) and pushed to Commons in batches. Call once when a
        company is first paired instead of waiting for the day-by-day loop to reach
        every historical date one at a time."""
        since = since or self.transport.books_from(self.company) or dt.date.today()
        until = until or dt.date.today()
        total = 0
        current = dt.date(since.year, since.month, 1)
        while current <= until:
            next_month = dt.date(current.year + (current.month == 12), current.month % 12 + 1, 1)
            month_end = min(next_month - dt.timedelta(days=1), until)
            vouchers = self.transport.vouchers(self.company, current.isoformat(), month_end.isoformat())
            sent = self.push_vouchers(vouchers)
            total += sent
            if progress:
                progress(current, month_end, len(vouchers), sent)
            current = next_month
        return total

def protect(data, decrypt=False):
    if os.name != "nt":
        raise RuntimeError("Connection-key storage requires Windows.")
    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    target = Blob()
    function = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)

STARTUP_REGISTRY_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
STARTUP_VALUE_NAME = "CommonsTallyConnector"

def set_start_with_windows(enabled):
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            pythonw = str(Path(sys.executable).with_name("pythonw.exe"))
            target = pythonw if Path(pythonw).exists() else sys.executable
            command = f'"{target}" "{Path(__file__).resolve()}" --minimized'
            winreg.SetValueEx(key, STARTUP_VALUE_NAME, 0, winreg.REG_SZ, command)
        else:
            try:
                winreg.DeleteValue(key, STARTUP_VALUE_NAME)
            except FileNotFoundError:
                pass

def starts_with_windows():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_REGISTRY_KEY, 0, winreg.KEY_READ) as key:
            winreg.QueryValueEx(key, STARTUP_VALUE_NAME)
            return True
    except FileNotFoundError:
        return False

def main():
    import tkinter as tk
    from tkinter import ttk, messagebox
    import msvcrt
    minimized_start = "--minimized" in sys.argv
    folder = Path(os.environ["LOCALAPPDATA"]) / "CommonsTallyConnector"
    folder.mkdir(parents=True, exist_ok=True)
    lock = open(folder / "running.lock", "a+b")
    lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        messagebox.showerror("Commons", "The connector is already running. Open its existing window.")
        return
    window = tk.Tk()
    window.title("Commons · TallyPrime Connector")
    window.geometry("760x650")
    window.configure(bg="#000000")
    style = ttk.Style()
    style.theme_use("clam")
    style.configure("TFrame", background="#000000")
    style.configure("TLabel", background="#000000", foreground="white", font=("Segoe UI", 11))
    style.configure("TButton", font=("Segoe UI", 11), padding=8)
    style.configure("TCheckbutton", background="#000000", foreground="white",font=("Segoe UI",11))
    frame = ttk.Frame(window, padding=24)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="commons", font=("Segoe UI", 26, "bold")).pack(anchor="w")
    ttk.Label(frame, text="Keep this window and your Tally company open while syncing.", wraplength=690).pack(anchor="w", pady=10)
    token = tk.StringVar()
    port = tk.StringVar(value="9000")
    company = tk.StringVar()
    start = tk.StringVar(value=dt.date.today().isoformat())
    receiving = tk.BooleanVar(value=True)
    for label, variable, masked in [("Tally HTTP port", port, False), ("Connection key from Commons → Tally → Live sync", token, True)]:
        ttk.Label(frame, text=label).pack(anchor="w", pady=(10, 4))
        ttk.Entry(frame, textvariable=variable, show="•" if masked else "").pack(fill="x")
    companies = {}
    ttk.Label(frame, text="Tally company").pack(anchor="w", pady=(10, 4))
    selector = ttk.Combobox(frame, textvariable=company, state="readonly")
    selector.pack(fill="x")
    events = queue.Queue()
    stop = threading.Event()
    thread = None
    backfill_thread = None
    date_auto_filled = {"value": True}
    def fetch_books_from(name):
        try:
            books_from = Transport("", port.get()).books_from(name)
            if books_from and date_auto_filled["value"]:
                events.put(("books_from", books_from.isoformat()))
        except Exception:
            pass  # Best-effort convenience only; the date field still works if typed by hand.
    def discover():
        selected_port=port.get()
        def task():
            try:
                rows=Transport("", selected_port).companies()
                if not rows or any(not name or not guid for name,guid in rows) or len({name for name,guid in rows})!=len(rows):
                    raise ValueError("Open your company in TallyPrime and enable its HTTP service, then try again.")
                events.put(("companies", rows))
                threading.Thread(target=fetch_books_from,args=(rows[0][0],),daemon=True).start()
            except Exception as error:
                events.put(("status", str(error)))
        threading.Thread(target=task,daemon=True).start()
    ttk.Button(frame, text="Find Tally companies", command=discover).pack(anchor="w", pady=10)
    def on_company_selected(_event=None):
        date_auto_filled["value"] = True
        name = company.get()
        if name:
            threading.Thread(target=fetch_books_from,args=(name,),daemon=True).start()
    selector.bind("<<ComboboxSelected>>", on_company_selected)
    ttk.Label(frame, text="Receive vouchers from (YYYY-MM-DD) — auto-filled from Tally's own books-start date").pack(anchor="w")
    date_entry = ttk.Entry(frame, textvariable=start)
    date_entry.pack(fill="x", pady=4)
    def on_date_typed(_event=None):
        date_auto_filled["value"] = False
    date_entry.bind("<Key>", on_date_typed)
    ttk.Checkbutton(frame, text="Receive Tally vouchers into Commons for review", variable=receiving).pack(anchor="w", pady=8)
    start_with_windows = tk.BooleanVar(value=starts_with_windows())
    def on_start_with_windows_toggled():
        try:
            set_start_with_windows(start_with_windows.get())
        except Exception as error:
            messagebox.showerror("Start with Windows", str(error))
            start_with_windows.set(not start_with_windows.get())
    ttk.Checkbutton(frame, text="Start automatically with Windows, minimized", variable=start_with_windows, command=on_start_with_windows_toggled).pack(anchor="w", pady=4)
    status = tk.StringVar(value="Find your company, paste the connection key, then connect.")
    ttk.Label(frame, textvariable=status, wraplength=680).pack(anchor="w", pady=12)
    def connect():
        nonlocal thread
        if thread and thread.is_alive():
            return
        try:
            name = company.get()
            guid = companies.get(name)
            if not guid or not re.fullmatch(r"[a-f0-9]{64}", token.get().strip()):
                raise ValueError("Select a discovered company and paste a valid connection key.")
            first_day = dt.date.fromisoformat(start.get())
            if first_day > dt.date.today():
                raise ValueError("Choose today or an earlier start date.")
            settings = {"token":token.get().strip(),"port":int(port.get()),"company":name,"guid":guid,"from":first_day.isoformat(),"receive":receiving.get()}
            (folder / "connection.dpapi").write_bytes(protect(json.dumps(settings).encode()))
        except Exception as error:
            messagebox.showerror("Connection details",str(error))
            return
        stop.clear()
        def run():
            connector = None
            day = first_day
            try:
                connector=Connector(Transport(settings["token"],settings["port"]),name,guid,folder / (hashlib.sha256((name+guid).encode()).hexdigest()[:24]+".sqlite"))
                while not stop.is_set():
                    try:
                        result=connector.cycle(day.isoformat() if settings["receive"] else None)
                        events.put(("status",result))
                        day=day+dt.timedelta(days=1) if day<dt.date.today() else first_day
                    except Exception as error:
                        events.put(("status","Paused this cycle: "+str(error)))
                    stop.wait(30)
            finally:
                if connector: connector.db.close()
        thread=threading.Thread(target=run,daemon=True)
        thread.start()
        status.set("Connecting… Approved transfers are checked every 30 seconds.")
    def run_backfill():
        nonlocal backfill_thread
        if backfill_thread and backfill_thread.is_alive():
            return
        try:
            name = company.get()
            guid = companies.get(name)
            if not guid or not re.fullmatch(r"[a-f0-9]{64}", token.get().strip()):
                raise ValueError("Select a discovered company and paste a valid connection key.")
        except Exception as error:
            messagebox.showerror("Full sync",str(error))
            return
        token_value,port_value=token.get().strip(),int(port.get())
        def task():
            events.put(("status","Full sync started — pulling the company's entire Tally history. This can take a while for a large company; the daily sync above keeps working meanwhile."))
            try:
                backfill_connector=Connector(Transport(token_value,port_value),name,guid,folder / (hashlib.sha256((name+guid).encode()).hexdigest()[:24]+".sqlite"))
                def progress(month_start,month_end,found,sent):
                    events.put(("status",f"Full sync: {month_start.isoformat()}..{month_end.isoformat()} — {found} vouchers found, {sent} sent to Commons."))
                total=backfill_connector.backfill(progress=progress)
                skipped=len(backfill_connector.skipped)
                backfill_connector.db.close()
                note=f" {skipped} oversized voucher(s) were skipped and need manual XML import." if skipped else ""
                events.put(("status",f"Full sync complete. {total} vouchers sent to Commons across the company's entire history.{note}"))
            except Exception as error:
                events.put(("status","Full sync stopped: "+str(error)))
        backfill_thread=threading.Thread(target=task,daemon=True)
        backfill_thread.start()
    balances_thread=None
    def run_balances():
        # Heavy for Tally (it computes every ledger's balance over the whole books period) and
        # can make a large company unresponsive, so this only ever runs when asked, never on connect.
        nonlocal balances_thread
        if balances_thread and balances_thread.is_alive():
            return
        try:
            name = company.get()
            guid = companies.get(name)
            if not guid or not re.fullmatch(r"[a-f0-9]{64}", token.get().strip()):
                raise ValueError("Select a discovered company and paste a valid connection key.")
        except Exception as error:
            messagebox.showerror("Tally balances",str(error))
            return
        if not messagebox.askyesno("Read Tally balances","This asks Tally for every ledger's opening and closing balance. On a large company Tally can be busy for several minutes and may be slow to respond meanwhile.\n\nRun it now, while nobody is using Tally?"):
            return
        token_value,port_value=token.get().strip(),int(port.get())
        def task():
            events.put(("status","Reading Tally balances - this can take several minutes. Keep Tally open and leave it alone."))
            try:
                job=Connector(Transport(token_value,port_value),name,guid,folder / (hashlib.sha256((name+guid).encode()).hexdigest()[:24]+".sqlite"))
                count=job.push_balances()
                job.db.close()
                events.put(("status","Tally balances sent for %d ledgers. Now click Check against Tally in Commons." % count))
            except Exception as error:
                events.put(("status","Tally balances could not be read: "+str(error)[:200]))
        balances_thread=threading.Thread(target=task,daemon=True)
        balances_thread.start()
    buttons=ttk.Frame(frame)
    buttons.pack(fill="x",pady=10)
    ttk.Button(buttons,text="Connect & start",command=connect).pack(side="left")
    ttk.Button(buttons,text="Pause",command=lambda:(stop.set(),status.set("Pausing after the current request finishes…"))).pack(side="left",padx=10)
    ttk.Button(buttons,text="Full sync now",command=run_backfill).pack(side="left",padx=10)
    ttk.Button(buttons,text="Read Tally balances",command=run_balances).pack(side="left",padx=10)
    ttk.Label(frame,text="\"Full sync now\" pulls this company's complete Tally history once (masters and every voucher back to books-start) — useful the first time a company is connected. The regular 30-second sync above only needs the last few days.",wraplength=690).pack(anchor="w",pady=4)
    ttk.Label(frame,text="Outgoing: approved accounting vouchers. Incoming: supported bills, purchases, receipts and stock details after review in Commons. Government filing and physical deletions are not automatic.",wraplength=690).pack(anchor="w",pady=8)
    loaded_settings=False
    try:
        settings=json.loads(protect((folder/"connection.dpapi").read_bytes(),True))
        token.set(settings["token"]);port.set(str(settings["port"]));start.set(settings["from"]);company.set(settings["company"])
        receiving.set(settings.get("receive",True))
        if settings.get("guid"):companies[settings["company"]]=settings["guid"];selector["values"]=list(companies)
        loaded_settings=True
    except FileNotFoundError:
        pass
    except Exception:
        status.set("Saved settings could not be opened. Paste a new key and reconnect.")
    def update():
        while not events.empty():
            kind,value=events.get()
            if kind=="companies":
                companies.clear();companies.update(value);selector["values"]=list(companies)
                if company.get() not in companies:company.set(next(iter(companies)))
                status.set("Companies found. Select the exact company paired in Commons.")
            elif kind=="books_from":
                start.set(value)
            else:status.set(value)
        window.after(300,update)
    if minimized_start and loaded_settings:
        connect()
        window.iconify()
    def close():
        stop.set()
        if thread and thread.is_alive():
            status.set("Finishing the current request before closing…")
            window.after(300,close)
        else:window.destroy()
    window.protocol("WM_DELETE_WINDOW",close)
    update();window.mainloop();lock.close()

def self_test():
    """Offline packaged-runtime smoke test; does not contact Tally or Commons."""
    import tempfile
    import tkinter as tk
    payload=b"commons-offline-runtime-test"
    if protect(protect(payload),True)!=payload: raise RuntimeError("Windows key storage failed.")
    window=tk.Tk();window.withdraw();window.update();window.destroy()
    with tempfile.TemporaryDirectory() as folder:
        connection=sqlite3.connect(str(Path(folder)/"test.sqlite"))
        connection.execute("CREATE TABLE smoke(value TEXT)")
        connection.execute("INSERT INTO smoke VALUES (?)",("ok",));connection.commit()
        if connection.execute("SELECT value FROM smoke").fetchone()[0]!="ok": raise RuntimeError("SQLite failed.")
        connection.close()
    parse_xml(collection_xml("Company"))

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
