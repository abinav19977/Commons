import hashlib
import tempfile
import unittest
import xml.etree.ElementTree as ET
from commons_connector import Connector, parse_xml, collection_xml, signature, NoRedirect

VOUCHER='<VOUCHER><GUID>voucher-1</GUID><DATE>20260909</DATE><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>JV-1</VOUCHERNUMBER><ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-100.00</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>'
XML='<ENVELOPE><SVCURRENTCOMPANY>My business</SVCURRENTCOMPANY>'+VOUCHER+'</ENVELOPE>'
JOB={'id':'job-1','source_key':'voucher-1','xml':XML,'digest':hashlib.sha256(XML.encode()).hexdigest()}

class Fake:
    def __init__(self):
        self.saved=[];self.posts=0;self.ledger=True;self.timeout=False;self.wrong=False;self.calls=[];self.job=None;self.fail_ack=False
    def companies(self): return [('Wrong' if self.wrong else 'My business','company-guid')]
    def vouchers(self,*args): return self.saved
    def tally(self,xml):
        if b'<TYPE>Ledger</TYPE>' in (xml.encode() if isinstance(xml,str) else xml):
            return ET.fromstring('<ENVELOPE><LEDGER NAME="Cash"/><LEDGER NAME="Sales"/></ENVELOPE>' if self.ledger else '<ENVELOPE/>')
        self.posts+=1;self.saved=[ET.fromstring(VOUCHER)]
        if self.timeout: raise TimeoutError('Response lost')
        return ET.fromstring('<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS></RESPONSE>')
    def api(self,payload):
        self.calls.append(payload)
        if payload['action']=='ack' and self.fail_ack: raise TimeoutError('Network offline')
        if payload['action']=='poll':
            job=self.job;self.job=None;return {'job':job}
        return {'ok':True}

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.fake=Fake();self.connector=Connector(self.fake,'My business','company-guid',self.temp.name+'/state.sqlite')
    def tearDown(self):self.connector.db.close();self.temp.cleanup()
    def test_create_verify_then_deduplicate(self):
        self.assertEqual(self.connector.deliver(JOB)[0],'sent');self.assertEqual(self.fake.posts,1)
        self.assertEqual(self.connector.deliver(JOB)[0],'sent');self.assertEqual(self.fake.posts,1)
    def test_company_mismatch_blocks_write(self):
        self.fake.wrong=True;self.assertEqual(self.connector.deliver(JOB)[0],'blocked');self.assertEqual(self.fake.posts,0)
    def test_missing_ledgers_block_before_post(self):
        self.fake.ledger=False;self.assertEqual(self.connector.deliver(JOB)[0],'blocked');self.assertEqual(self.fake.posts,0)
    def test_timeout_and_delivery_check_never_repost(self):
        self.fake.timeout=True;self.assertEqual(self.connector.deliver(JOB)[0],'uncertain')
        self.assertEqual(self.connector.deliver({**JOB,'checkOnly':True})[0],'sent');self.assertEqual(self.fake.posts,1)
    def test_missing_uncertain_voucher_never_posts(self):
        self.assertEqual(self.connector.deliver({**JOB,'checkOnly':True})[0],'uncertain');self.assertEqual(self.fake.posts,0)
    def test_existing_different_values_never_overwrites(self):
        self.fake.saved=[ET.fromstring(VOUCHER.replace('100.00','200.00'))]
        self.assertEqual(self.connector.deliver(JOB)[0],'uncertain');self.assertEqual(self.fake.posts,0)
    def test_failed_ack_is_replayed_without_posting_again(self):
        self.fake.job=JOB;self.fake.fail_ack=True
        with self.assertRaises(TimeoutError): self.connector.cycle()
        self.assertEqual(self.fake.posts,1)
        self.fake.fail_ack=False;self.connector.cycle();self.assertEqual(self.fake.posts,1)
        self.assertEqual(self.connector.db.execute('SELECT COUNT(*) FROM results').fetchone()[0],0)
    def test_incoming_unchanged_only_transmitted_once(self):
        self.fake.saved=[ET.fromstring(VOUCHER)]
        self.connector.cycle('2026-09-09');self.connector.cycle('2026-09-09')
        self.assertEqual(len([c for c in self.fake.calls if c['action']=='inbox']),1)
    def test_tampered_payload_never_posts(self):
        self.assertEqual(self.connector.deliver({**JOB,'digest':'bad'})[0],'blocked');self.assertEqual(self.fake.posts,0)
    def test_xml_entities_and_redirects_are_rejected(self):
        with self.assertRaises(ValueError):parse_xml('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///private">]><x/>')
        with self.assertRaises(ValueError):NoRedirect().redirect_request(None,None,None,None,None,None)
    def test_company_and_date_are_escaped_in_collection(self):
        root=parse_xml(collection_xml('Voucher','A & B','2026-09-09','2026-09-09'))
        self.assertEqual(root.findtext('.//SVCURRENTCOMPANY'),'A & B')
        self.assertEqual(root.findtext('.//SVFROMDATE'),'20260909')

class AllocationVerificationTests(unittest.TestCase):
    def test_unchanged_ledger_totals_cannot_hide_a_changed_bill_reference(self):
        original=VOUCHER.replace('</ALLLEDGERENTRIES.LIST>','<BILLALLOCATIONS.LIST><NAME>INV-1</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>100</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>',1)
        self.assertNotEqual(signature(ET.fromstring(original)),signature(ET.fromstring(original.replace('INV-1','INV-2'))))
    def test_stock_quantity_changes_cannot_pass_readback(self):
        original=VOUCHER.replace('</VOUCHER>','<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Sheets</STOCKITEMNAME><ACTUALQTY>2 PCS</ACTUALQTY><AMOUNT>100</AMOUNT></ALLINVENTORYENTRIES.LIST></VOUCHER>')
        self.assertNotEqual(signature(ET.fromstring(original)),signature(ET.fromstring(original.replace('2 PCS','3 PCS'))))
    def test_cancellation_and_party_changes_cannot_pass_readback(self):
        self.assertNotEqual(signature(ET.fromstring(VOUCHER)),signature(ET.fromstring(VOUCHER.replace('</VOUCHER>','<ISCANCELLED>Yes</ISCANCELLED></VOUCHER>'))))
    def test_money_formatting_alone_does_not_change_signature(self):
        self.assertEqual(signature(ET.fromstring(VOUCHER)),signature(ET.fromstring(VOUCHER.replace('100.00','100.000'))))

if __name__=='__main__':unittest.main()
