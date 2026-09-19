import hashlib
import tempfile
import unittest
import xml.etree.ElementTree as ET
from commons_connector import slim_voucher_xml, Connector, Transport, parse_xml, collection_xml, company_collection_xml, company_rows, signature, NoRedirect

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




    def test_audit_lists_light_index_asks_commons_and_resends_only_the_missing(self):
        import datetime as dt
        have={'g1','g3'}
        index=[{'guid':'g%d'%n,'date':'20260315','type':'Payment','number':str(n)} for n in range(1,5)]
        def voucher(guid): return ET.fromstring('<VOUCHER><GUID>%s</GUID><DATE>20260315</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME></VOUCHER>'%guid)
        self.fake.books_from=lambda company:dt.date.today().replace(day=1)
        self.fake.voucher_index=lambda company,start,end:index
        self.fake.vouchers=lambda company,start,end=None:[voucher('g%d'%n) for n in range(1,5)]
        original_api=self.fake.api
        def api(payload):
            if payload['action']=='voucher_index':
                self.fake.calls.append(payload)
                return {'ok':True,'missing':[i for i in payload['items'] if i['guid'] not in have]}
            return original_api(payload)
        self.fake.api=api
        result=self.connector.audit_vouchers()
        self.assertEqual((result['checked'],result['missing'],result['recovered']),(4,2,2))
        self.assertEqual(result['by_type'],{'Payment':2})
        sent=[x for c in self.fake.calls if c['action']=='inbox_batch' for x in c['items']]
        self.assertEqual(sorted(ET.fromstring(x).findtext('GUID') for x in sent),['g2','g4'])
        # A forced re-send also works for a voucher the connector already believes it delivered.
        self.assertEqual(self.connector.push_vouchers([voucher('g2')],force={'g2'}),1)
    def test_trial_balance_request_is_a_single_report_export(self):
        import datetime as dt
        from commons_connector import trial_balance_xml
        root=ET.fromstring(trial_balance_xml("Co & Sons",dt.date(2023,4,1),dt.date(2026,9,19)))
        self.assertEqual(root.findtext('.//TYPE'),'Data');self.assertEqual(root.findtext('.//ID'),'Trial Balance')
        self.assertEqual(root.findtext('.//SVFROMDATE'),'20230401');self.assertEqual(root.findtext('.//SVCURRENTCOMPANY'),'Co & Sons')
    def test_trial_balance_rows_become_credit_positive_closings_for_real_ledgers_only(self):
        from commons_connector import trial_balance_closings
        report=ET.fromstring('<ENVELOPE>'
          '<DSPACCNAME><DSPDISPNAME>Capital Account</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA></DSPCLDRAMTA></DSPCLDRAMT><DSPCLCRAMT><DSPCLCRAMTA>1,880,031.55</DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO>'
          '<DSPACCNAME><DSPDISPNAME>Bank</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>-1500.50</DSPCLDRAMTA></DSPCLDRAMT><DSPCLCRAMT><DSPCLCRAMTA></DSPCLCRAMTA></DSPCLCRAMT></DSPACCINFO>'
          '<DSPACCNAME><DSPDISPNAME>Some Group Total</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>999</DSPCLDRAMTA></DSPCLDRAMT></DSPACCINFO></ENVELOPE>')
        rows=trial_balance_closings(report,["Capital Account","Bank"])
        self.assertEqual(rows,{"Capital Account":188003155,"Bank":-150050})
    def test_balances_are_one_report_and_sent_in_chunks_with_progress(self):
        import datetime as dt
        names=['L%d'%n for n in range(300)]
        def tally(xml,timeout=180):
            raw=xml.decode() if isinstance(xml,bytes) else xml
            if 'Trial Balance' in raw:
                return ET.fromstring('<ENVELOPE>'+''.join('<DSPACCNAME><DSPDISPNAME>%s</DSPDISPNAME></DSPACCNAME><DSPACCINFO><DSPCLDRAMT><DSPCLDRAMTA>10</DSPCLDRAMTA></DSPCLDRAMT></DSPACCINFO>'%n for n in names)+'</ENVELOPE>')
            return ET.fromstring('<ENVELOPE>'+''.join('<LEDGER NAME="%s"/>'%n for n in names)+'</ENVELOPE>')
        self.fake.tally=tally;self.fake.books_from=lambda company:dt.date(2023,4,1)
        self.fake.trial_balance=lambda company,start,end,timeout=240:tally(b'Trial Balance')
        steps=[]
        result=self.connector.push_balances(lambda label,done,total,per:steps.append((done,total)))
        self.assertEqual(result,{"ledgers":300,"of":300})
        masters=[c for c in self.fake.calls if c['action']=='masters']
        self.assertEqual(len(masters),2);self.assertEqual(masters[0]['ledgers'][0],{"name":"L0","closingPaise":-1000})
        self.assertEqual(steps[-1],(300,300))
    def test_an_unreadable_trial_balance_says_what_tags_came_back(self):
        import datetime as dt
        self.fake.books_from=lambda company:dt.date(2023,4,1)
        self.fake.tally=lambda xml,timeout=180:ET.fromstring('<ENVELOPE><LEDGER NAME="A"/></ENVELOPE>')
        self.fake.trial_balance=lambda company,start,end,timeout=240:ET.fromstring('<ENVELOPE><SOMETHING/></ENVELOPE>')
        with self.assertRaises(ValueError) as caught: self.connector.push_balances()
        self.assertIn("SOMETHING",str(caught.exception))
    def test_slimming_removes_empty_padding_without_changing_meaning(self):
        # Tally pads vouchers with hundreds of empty tags; an invoice with many lines then
        # passed the old 64 KB limit and was silently skipped.
        padded = VOUCHER.replace('</VOUCHER>', ''.join('<PAD%d />' % n for n in range(3000)) + '<ALLLEDGERENTRIES.LIST>   </ALLLEDGERENTRIES.LIST></VOUCHER>')
        original = ET.fromstring(padded)
        slim = slim_voucher_xml(original)
        self.assertLess(len(slim), len(padded) / 2)
        self.assertEqual(signature(ET.fromstring(slim)), signature(ET.fromstring(VOUCHER)))
    def test_prefixed_tags_without_namespace_declaration_parse(self):
        # Confirmed on a real company's history pull: UDF: tags with no xmlns in scope made
        # the whole Full sync stop with "unbound prefix".
        root = parse_xml('<ENVELOPE><TALLYMESSAGE><VOUCHER><UDF:BILLCOUNT.LIST><NAME>a:b</NAME></UDF:BILLCOUNT.LIST></VOUCHER></TALLYMESSAGE></ENVELOPE>')
        self.assertEqual(root.findtext('.//UDF_BILLCOUNT.LIST/NAME'), 'a:b')
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
        self.assertEqual(len([c for c in self.fake.calls if c['action'] in ('inbox','inbox_batch')]),1)
    def test_tampered_payload_never_posts(self):
        self.assertEqual(self.connector.deliver({**JOB,'digest':'bad'})[0],'blocked');self.assertEqual(self.fake.posts,0)
    def test_xml_entities_and_redirects_are_rejected(self):
        with self.assertRaises(ValueError):parse_xml('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///private">]><x/>')
        with self.assertRaises(ValueError):NoRedirect().redirect_request(None,None,None,None,None,None)
    def test_company_and_date_are_escaped_in_collection(self):
        root=parse_xml(collection_xml('Voucher','A & B','2026-09-09','2026-09-09'))
        self.assertEqual(root.findtext('.//SVCURRENTCOMPANY'),'A & B')
        self.assertEqual(root.findtext('.//SVFROMDATE'),'20260909')

    def test_voucher_collection_explicitly_requests_ledger_entry_lists(self):
        # FETCH:* alone does not reliably return ALLLEDGERENTRIES.LIST for plain
        # accounting vouchers on some TallyPrime builds; NATIVEMETHOD must ask for it.
        root=parse_xml(collection_xml('Voucher','My business','2026-09-09','2026-09-09'))
        native=root.findtext('.//NATIVEMETHOD')
        self.assertIn('ALLLEDGERENTRIES.LIST',native)
        self.assertIn('LEDGERENTRIES.LIST',native)

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

class CompanyDiscoveryTests(unittest.TestCase):
    def test_uses_loaded_primary_company_collection(self):
        root=ET.fromstring(company_collection_xml())
        coll=root.find('.//COLLECTION')
        self.assertEqual(root.findtext('.//ID'),'CommonsCompanies')
        self.assertEqual(coll.findtext('SOURCECOLLECTION'),'List of Primary Companies')
        self.assertEqual(coll.findtext('NATIVEMETHOD'),'Name,GUID')

    def test_reads_native_attribute_and_nested_name_shapes(self):
        native=ET.fromstring('<ENVELOPE><COMPANY NAME="Hari Polipacking"><GUID>guid-one</GUID></COMPANY></ENVELOPE>')
        nested=ET.fromstring('<ENVELOPE><CMPINFO><COMPANYNAME>Second Firm</COMPANYNAME><COMPANYGUID>guid-two</COMPANYGUID></CMPINFO></ENVELOPE>')
        name_list=ET.fromstring('<ENVELOPE><COMPANY><NAME.LIST><NAME>Third Firm</NAME></NAME.LIST><GUID.LIST><GUID>guid-three</GUID></GUID.LIST></COMPANY></ENVELOPE>')
        self.assertEqual(company_rows(native),[('Hari Polipacking','guid-one')])
        self.assertEqual(company_rows(nested),[('Second Firm','guid-two')])
        self.assertEqual(company_rows(name_list),[('Third Firm','guid-three')])

    def test_transport_falls_back_to_legacy_company_collection(self):
        transport=object.__new__(Transport)
        calls=[]
        def tally(request):
            calls.append(request)
            if len(calls)==1:return ET.fromstring('<ENVELOPE><COLLECTION/></ENVELOPE>')
            return ET.fromstring('<ENVELOPE><COMPANY NAME="Fallback"><GUID>fallback-guid</GUID></COMPANY></ENVELOPE>')
        transport.tally=tally
        self.assertEqual(transport.companies(),[('Fallback','fallback-guid')])
        self.assertEqual(len(calls),2)

    def test_empty_company_response_is_an_explicit_error(self):
        transport=object.__new__(Transport)
        transport.tally=lambda request: ET.fromstring('<ENVELOPE><COLLECTION/></ENVELOPE>')
        with self.assertRaisesRegex(ValueError,'reachable.*stable GUID'):
            transport.companies()

class TransportVoucherParsingTests(unittest.TestCase):
    def test_cmpinfo_voucher_counter_is_not_mistaken_for_a_real_voucher(self):
        # Every real Tally response wraps DATA in a CMPINFO block that includes its
        # own <VOUCHER>0</VOUCHER> counter tag, sharing a name with real vouchers.
        transport=object.__new__(Transport)
        transport.tally=lambda request: ET.fromstring(
            '<ENVELOPE><BODY><DESC><CMPINFO><COMPANY>0</COMPANY><VOUCHER>0</VOUCHER></CMPINFO></DESC>'
            '<DATA><COLLECTION>'+VOUCHER+'</COLLECTION></DATA></BODY></ENVELOPE>'
        )
        rows=transport.vouchers('My business','2026-09-09')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0].findtext('GUID'),'voucher-1')

class ApiRequestTests(unittest.TestCase):
    def test_api_identifies_itself_instead_of_using_the_blockable_default_user_agent(self):
        # Cloudflare's bot protection on the deployed domain returns HTTP 403
        # (error 1010) for Python's default "Python-urllib/x.y" User-Agent.
        transport=Transport('token',9000)
        captured=[]
        class FakeOpener:
            def open(self,request,timeout=None):
                captured.append(request)
                class Resp:
                    def __enter__(self):return self
                    def __exit__(self,*a):return False
                    def read(self,*a):return b'{"ok":true}'
                return Resp()
        transport.cloud=FakeOpener()
        transport.api({'action':'poll'})
        self.assertEqual(len(captured),1)
        self.assertNotIn('Python-urllib',captured[0].get_header('User-agent') or '')
        self.assertTrue(captured[0].get_header('User-agent'))

if __name__=='__main__':unittest.main()
