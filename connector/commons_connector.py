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
import threading
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

SITE = "https://commons-daily-solutions.abinav1997.chatgpt.site"
MAX_XML = 4_000_000
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
    root = ET.fromstring(text)
    error = root.findtext(".//LINEERROR") or root.findtext(".//ERROR")
    if error or root.findtext(".//STATUS") == "0":
        raise ValueError(error or "Tally rejected the request.")
    return root

def collection_xml(kind, company="", start=None, end=None):
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
    if start and kind == "Voucher":
        ET.SubElement(coll, "FILTERS").text = "CommonsDates"
        ET.SubElement(message, "SYSTEM", {"TYPE": "Formulae", "NAME": "CommonsDates"}).text = "$Date >= ##SVFromDate AND $Date <= ##SVToDate"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)

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
    ledgers = []
    for tag in ["ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"]:
        for entry in voucher.findall(tag):
            bills = sorted((clean(b.findtext("NAME")), clean(b.findtext("BILLTYPE")).lower(), amount(b)) for b in entry.findall("BILLALLOCATIONS.LIST"))
            ledgers.append((clean(entry.findtext("LEDGERNAME")), amount(entry), tuple(bills)))
    items = []
    for tag in ["ALLINVENTORYENTRIES.LIST", "INVENTORYENTRIES.LIST", "INVENTORYENTRIESIN.LIST", "INVENTORYENTRIESOUT.LIST"]:
        for item in voucher.findall(tag):
            allocations = sorted((clean(a.findtext("LEDGERNAME")), amount(a)) for a in item.findall("ACCOUNTINGALLOCATIONS.LIST"))
            batches = sorted((clean(b.findtext("GODOWNNAME")), clean(b.findtext("BATCHNAME")), quantity(b,"ACTUALQTY") or quantity(b,"BILLEDQTY"), amount(b), clean(b.findtext("MFDON")), clean(b.findtext("EXPIRYPERIOD"))) for b in item.findall("BATCHALLOCATIONS.LIST"))
            actual = quantity(item,"ACTUALQTY") or quantity(item,"BILLEDQTY")
            billed = quantity(item,"BILLEDQTY") or actual
            items.append((clean(item.findtext("STOCKITEMNAME")), actual, billed, amount(item), tuple(allocations), tuple(batches)))
    fields = tuple(clean(voucher.findtext(tag)) for tag in ["DATE","VOUCHERTYPENAME","VOUCHERNUMBER","PARTYLEDGERNAME","PARTYGSTIN","PLACEOFSUPPLY","REFERENCE"])
    flags = tuple(clean(voucher.findtext(tag)).lower()=="yes" for tag in ["ISCANCELLED","ISOPTIONAL"])
    return (fields, flags, sorted(ledgers), sorted(items))

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
        with self.local.open(request, timeout=30) as response:
            data = response.read(MAX_XML + 1)
        if len(data) > MAX_XML:
            raise ValueError("Tally response exceeds 4 MB. Narrow the receiving period.")
        return parse_xml(data)

    def api(self, payload):
        request = urllib.request.Request(SITE + "/api/integrations/tally/connector", data=json.dumps({**payload,"protocolVersion":PROTOCOL_VERSION},ensure_ascii=False).encode(), headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
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
        root = self.tally(collection_xml("Company"))
        return [(item.attrib.get("NAME") or item.findtext("NAME") or "", item.findtext("GUID") or "") for item in root.findall(".//COMPANY")]

    def vouchers(self, company, date):
        root = self.tally(collection_xml("Voucher", company, date, date))
        if root.find(".//COLLECTION") is None:
            raise ValueError("Tally did not return a voucher collection. No voucher was sent.")
        return root.findall(".//VOUCHER")

class Connector:
    def __init__(self, transport, company, guid, database):
        self.transport, self.company, self.guid = transport, company, guid
        self.db = sqlite3.connect(database)
        self.db.execute("CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, status TEXT NOT NULL, message TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS received (scope TEXT, guid TEXT, digest TEXT, PRIMARY KEY(scope,guid))")
        self.scope = company + ":" + guid

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
                    return "uncertain", "The voucher identifier exists in Tally with different values. Review it manually."
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
            if len(found) != 1 or signature(found[0]) != signature(voucher):
                return "uncertain", "Tally accepted the request but read-back verification failed. Check delivery."
            return "sent", "Created and verified in Tally."
        except Exception as error:
            return ("uncertain" if attempted or job.get("checkOnly") else "blocked"), str(error)[:400]

    def cycle(self, receiving_day=None):
        self.verify_company()
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
            if len(incoming) > 500:
                raise ValueError("More than 500 vouchers in this day. Use manual XML exchange for this date.")
            count = 0
            for voucher in incoming:
                guid = identity(voucher)
                if not guid:
                    raise ValueError("Incoming voucher has no stable GUID. Receive stopped for review.")
                xml = ET.tostring(voucher, encoding="unicode")
                if len(xml.encode("utf-8")) > 64000:
                    raise ValueError("An incoming voucher exceeds 64 KB. Use manual XML import for this date.")
                value = hashlib.sha256(xml.encode()).hexdigest()
                prior = self.db.execute("SELECT digest FROM received WHERE scope=? AND guid=?", (self.scope, guid)).fetchone()
                if prior and prior[0] == value:
                    continue
                self.call("inbox", xml=xml)
                self.db.execute("INSERT OR REPLACE INTO received VALUES (?,?,?)", (self.scope, guid, value))
                self.db.commit()
                count += 1
            result += f" Received {count} new or changed vouchers for {receiving_day}."
        return result

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

def main():
    import tkinter as tk
    from tkinter import ttk, messagebox
    import msvcrt
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
    def discover():
        selected_port=port.get()
        def task():
            try:
                rows=Transport("", selected_port).companies()
                if not rows or any(not name or not guid for name,guid in rows) or len({name for name,guid in rows})!=len(rows):
                    raise ValueError("Open your company in TallyPrime and enable its HTTP service, then try again.")
                events.put(("companies", rows))
            except Exception as error:
                events.put(("status", str(error)))
        threading.Thread(target=task,daemon=True).start()
    ttk.Button(frame, text="Find Tally companies", command=discover).pack(anchor="w", pady=10)
    ttk.Label(frame, text="Receive vouchers from (YYYY-MM-DD)").pack(anchor="w")
    ttk.Entry(frame, textvariable=start).pack(fill="x", pady=4)
    ttk.Checkbutton(frame, text="Receive Tally vouchers into Commons for review", variable=receiving).pack(anchor="w", pady=8)
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
    buttons=ttk.Frame(frame)
    buttons.pack(fill="x",pady=10)
    ttk.Button(buttons,text="Connect & start",command=connect).pack(side="left")
    ttk.Button(buttons,text="Pause",command=lambda:(stop.set(),status.set("Pausing after the current request finishes…"))).pack(side="left",padx=10)
    ttk.Label(frame,text="Outgoing: approved accounting vouchers. Incoming: supported bills, purchases, receipts and stock details after review in Commons. Government filing and physical deletions are not automatic.",wraplength=690).pack(anchor="w",pady=8)
    try:
        settings=json.loads(protect((folder/"connection.dpapi").read_bytes(),True))
        token.set(settings["token"]);port.set(str(settings["port"]));start.set(settings["from"]);company.set(settings["company"])
        receiving.set(settings.get("receive",True))
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
            else:status.set(value)
        window.after(300,update)
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
    import sys
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
