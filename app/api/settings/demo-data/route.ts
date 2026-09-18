import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawDb } from "../../../../db";
import { getChatGPTUser } from "../../../company-auth";
import { advanceEntry,payrollEntry,purchaseEntry,receiptEntry,salesEntry } from "../../../lib/accounting";
import { prepareJournal } from "../../../lib/book-server";

const schema=z.object({action:z.enum(["populate","reset"]),confirmation:z.string().optional().default("")});
const prefix="commons-demo-";

function cleanup(raw:ReturnType<typeof getRawDb>,owner:string){return [
  // The audit trail is never deleted, including here — not even for synthetic demo
  // entries. Indian audit-trail rules (Companies (Accounts) Rules, Rule 3(1)) require an
  // edit log that cannot be tampered with or disabled; a code path that deletes
  // audit_events, however narrowly scoped, is exactly the kind of exception that
  // undermines "cannot be disabled" in an audit. The demo entries' journal_entries/
  // journal_lines are removed as before; their audit_events rows simply become historical
  // records of a demo that once existed, same as any other reversed/corrected entry.
  raw.prepare("DELETE FROM journal_lines WHERE owner_user_id=? AND entry_id IN (SELECT id FROM journal_entries WHERE owner_user_id=? AND source_type LIKE 'demo_seed_%')").bind(owner,owner),
  raw.prepare("DELETE FROM journal_entries WHERE owner_user_id=? AND source_type LIKE 'demo_seed_%'").bind(owner),
  raw.prepare("DELETE FROM invoice_payments WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM invoice_items WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM invoices WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM purchase_items WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM purchases WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM stock_movements WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM payroll_entries WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM payment_advances WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM products WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM suppliers WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM employees WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
  raw.prepare("DELETE FROM customers WHERE owner_user_id=? AND id LIKE ?").bind(owner,`${prefix}%`),
]}

export async function POST(request:Request){const user=await getChatGPTUser(request);if(!user)return NextResponse.json({message:"Please sign in again."},{status:401});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"Invalid demo action."},{status:400});if(parsed.data.action==="reset"&&parsed.data.confirmation!=="RESET DEMO")return NextResponse.json({message:"Reset confirmation was not received."},{status:400});const raw=getRawDb();try{if(parsed.data.action==="reset"){await raw.batch(cleanup(raw,user.id));return NextResponse.json({message:"Generated demo records were reset. Your own records were not changed."})}
  const prefix=`commons-demo-${crypto.randomUUID()}-`;
  const customer=`${prefix}customer`;const supplier=`${prefix}supplier`;const rawProduct=`${prefix}raw`;const finished=`${prefix}finished`;const employee=`${prefix}employee`;const invoice=`${prefix}invoice`;const purchase=`${prefix}purchase`;const payment=`${prefix}payment`;const payroll=`${prefix}payroll`;const advance=`${prefix}advance`;const now=Date.now();
  const saleJournal=await prepareJournal({ownerUserId:user.id,actor:"Commons Demo",entryDate:"2026-09-05",sourceType:"demo_seed_sales",sourceId:invoice,description:"Demo sale · Metro Retail",lines:salesEntry(1000000,180000,false,400000)});
  const purchaseJournal=await prepareJournal({ownerUserId:user.id,actor:"Commons Demo",entryDate:"2026-09-02",sourceType:"demo_seed_purchase",sourceId:purchase,description:"Demo purchase · Southern Supplies",lines:purchaseEntry(600000,108000)});
  const receiptJournal=await prepareJournal({ownerUserId:user.id,actor:"Commons Demo",entryDate:"2026-09-07",sourceType:"demo_seed_receipt",sourceId:payment,description:"Demo receipt · INV-DEMO-001",lines:receiptEntry(500000)});
  const payrollJournal=await prepareJournal({ownerUserId:user.id,actor:"Commons Demo",entryDate:"2026-09-06",sourceType:"demo_seed_payroll",sourceId:payroll,description:"Demo salary · Anjali Nair",lines:payrollEntry(3000000,0,0,3000000)});
  const advanceJournal=await prepareJournal({ownerUserId:user.id,actor:"Commons Demo",entryDate:"2026-09-04",sourceType:"demo_seed_advance",sourceId:advance,description:"Demo customer advance · Metro Retail",lines:advanceEntry("customer_received",200000)});
  const inserts=[
    raw.prepare("INSERT INTO customers (id,owner_user_id,customer_type,display_name,nickname,primary_phone,email,gst_registration_type,gstin,place_of_supply,billing_address_line_1,billing_city,billing_state,billing_pin_code,shipping_same_as_billing,credit_days,credit_limit_paise,opening_balance_paise,balance_type,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(customer,user.id,"business","Metro Retail Private Limited","Metro","9876543210","accounts@metro.example","regular","32ABCDE1234F1Z5","Kerala","MG Road","Kochi","Kerala","682016",1,15,2500000,0,"receivable","Commons generated demo",now,now),
    raw.prepare("INSERT INTO suppliers (id,owner_user_id,name,contact_name,primary_phone,email,gst_registration_type,gstin,address_line_1,city,state,pin_code,payment_terms_days,opening_payable_paise,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(supplier,user.id,"Southern Supplies","Ravi Kumar","9895012345","sales@southern.example","regular","32ABCDE5678F1Z2","Industrial Estate","Kozhikode","Kerala","673016",30,0,"Commons generated demo",1,now,now),
    raw.prepare("INSERT INTO products (id,owner_user_id,item_type,name,sku,category,hsn_sac,unit,purchase_price_paise,sale_price_paise,price_includes_tax,gst_rate_basis_points,opening_stock_milli,reorder_level_milli,warehouse,supplier,supplier_id,description,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(rawProduct,user.id,"product","Food-grade Packaging Roll","DEMO-RAW-01","Raw material","3920","KG",20000,0,0,1800,30000,10000,"Main Warehouse","Southern Supplies",supplier,"Commons generated demo",1,now,now),
    raw.prepare("INSERT INTO products (id,owner_user_id,item_type,name,sku,category,hsn_sac,unit,purchase_price_paise,sale_price_paise,price_includes_tax,gst_rate_basis_points,opening_stock_milli,reorder_level_milli,warehouse,supplier,supplier_id,description,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(finished,user.id,"manufactured_product","Premium Packaging Sheet","DEMO-FG-01","Finished goods","3921","PCS",40000,100000,0,1800,20000,5000,"Main Warehouse","Southern Supplies",supplier,"Commons generated demo",1,now,now),
    raw.prepare("INSERT INTO employees (id,owner_user_id,name,phone,email,role,department,employment_type,joining_date,monthly_salary_paise,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(employee,user.id,"Anjali Nair","9847001122","anjali@example.com","Accounts Executive","Finance","full_time","2025-06-01",3000000,"active",now,now),
    raw.prepare("INSERT INTO purchases (id,owner_user_id,purchase_number,supplier_id,supplier_name,supplier_gstin,supplier_invoice_number,purchase_date,subtotal_paise,gst_paise,total_paise,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(purchase,user.id,"PUR-DEMO-001",supplier,"Southern Supplies","32ABCDE5678F1Z2","SS-4401","2026-09-02",600000,108000,708000,"received","Commons generated demo",now),
    raw.prepare("INSERT INTO purchase_items (id,purchase_id,owner_user_id,product_id,description,quantity_milli,unit,unit_cost_paise,gst_rate_basis_points,taxable_paise,gst_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${prefix}purchase-item`,purchase,user.id,rawProduct,"Food-grade Packaging Roll",30000,"KG",20000,1800,600000,108000,708000,0),
    raw.prepare("INSERT INTO invoices (id,owner_user_id,invoice_number,invoice_date,due_date,customer_id,customer_name,customer_gstin,customer_address,place_of_supply,supply_type,subtotal_paise,discount_paise,cgst_paise,sgst_paise,igst_paise,cess_paise,total_paise,paid_paise,status,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(invoice,user.id,"INV-DEMO-001","2026-09-05","2026-09-20",customer,"Metro Retail Private Limited","32ABCDE1234F1Z5","MG Road, Kochi","Kerala","intra_state",1000000,0,90000,90000,0,0,1180000,500000,"part_paid","Commons generated demo",now),
    raw.prepare("INSERT INTO invoice_items (id,invoice_id,owner_user_id,product_id,description,hsn_sac,quantity_milli,unit,rate_paise,gst_rate_basis_points,taxable_paise,tax_paise,total_paise,position) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${prefix}invoice-item`,invoice,user.id,finished,"Premium Packaging Sheet","3921",10000,"PCS",100000,1800,1000000,180000,1180000,0),
    raw.prepare("INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${prefix}stock-buy`,user.id,rawProduct,"purchase","2026-09-02",30000,"KG",20000,600000,"Southern Supplies","SS-4401","Commons generated demo",now),
    raw.prepare("INSERT INTO stock_movements (id,owner_user_id,product_id,movement_type,movement_date,quantity_milli,unit,unit_cost_paise,total_value_paise,supplier,reference,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(`${prefix}stock-sale`,user.id,finished,"sale","2026-09-05",-10000,"PCS",40000,400000,null,"INV-DEMO-001","Commons generated demo",now),
    raw.prepare("INSERT INTO invoice_payments (id,owner_user_id,invoice_id,invoice_number,customer_name,payment_date,amount_paise,payment_mode,reference,journal_entry_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(payment,user.id,invoice,"INV-DEMO-001","Metro Retail Private Limited","2026-09-07",500000,"bank_transfer","DEMO-UTR-001",receiptJournal.id,now),
    raw.prepare("INSERT INTO payroll_entries (id,owner_user_id,employee_key,employee_name,salary_month,base_salary_paise,bonus_paise,advance_deduction_paise,other_deduction_paise,net_pay_paise,payment_date,payment_mode,reference,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(payroll,user.id,employee,"Anjali Nair","2026-08",3000000,0,0,0,3000000,"2026-09-06","bank_transfer","PAY-DEMO-001","paid","Commons generated demo",now,now),
    raw.prepare("INSERT INTO payment_advances (id,owner_user_id,advance_type,party_id,party_name,advance_date,amount_paise,applied_paise,payment_mode,reference,purpose,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(advance,user.id,"customer_received",customer,"Metro Retail Private Limited","2026-09-04",200000,0,"bank_transfer","ADV-DEMO-001","Future order","Commons generated demo","active",now,now),
  ];
  await raw.batch([...cleanup(raw,user.id),...inserts,...purchaseJournal.statements,...saleJournal.statements,...receiptJournal.statements,...payrollJournal.statements,...advanceJournal.statements]);
  return NextResponse.json({message:"Connected demo data is ready across business, finance and accounts."},{status:201});
}catch(error){console.error("Demo data action failed",error);return NextResponse.json({message:"Demo data could not be updated."},{status:500})}}
