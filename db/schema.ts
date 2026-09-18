import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  accountUserId: text("account_user_id").notNull(),
  slot: integer("slot").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("companies_account_slot_unique").on(table.accountUserId, table.slot),
  check("companies_five_slots", sql`${table.slot} BETWEEN 1 AND 5`),
]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("accounts_email_unique").on(table.email)]);

export const accountSessions = sqliteTable("account_sessions", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("account_sessions_token_unique").on(table.tokenHash),
  index("account_sessions_account").on(table.accountId),
]);

export const tallyBridges = sqliteTable("tally_bridges", {
  id:text("id").primaryKey(), ownerUserId:text("owner_user_id").notNull(),
  tallyName:text("tally_name").notNull(), tallyGuid:text("tally_guid"),
  tokenHash:text("token_hash").notNull(), expiresAt:integer("expires_at").notNull(),
  revoked:integer("revoked").notNull().default(0), lastSeen:integer("last_seen"),
  createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("tally_bridge_owner").on(t.ownerUserId),uniqueIndex("tally_bridge_token").on(t.tokenHash)]);

export const tallyTransfers = sqliteTable("tally_transfers", {
  id:text("id").primaryKey(), ownerUserId:text("owner_user_id").notNull(),
  bridgeId:text("bridge_id").notNull(), direction:text("direction").notNull(),
  sourceKey:text("source_key").notNull(), label:text("label").notNull(),
  xml:text("xml").notNull(), digest:text("digest").notNull(),
  status:text("status").notNull(), message:text("message"),
  createdAt:integer("created_at").notNull(), updatedAt:integer("updated_at").notNull(),
},t=>[uniqueIndex("tally_transfer_source").on(t.bridgeId,t.direction,t.sourceKey),index("tally_transfer_queue").on(t.bridgeId,t.direction,t.status)]);

export const tallyImportReceipts=sqliteTable("tally_import_receipts",{
 id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),sourceKey:text("source_key").notNull(),createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("tally_import_once").on(t.ownerUserId,t.sourceKey)]);

export const tallyDocuments=sqliteTable("tally_documents",{
 id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),guid:text("guid").notNull(),
 revision:text("revision").notNull(),kind:text("kind").notNull(),localId:text("local_id"),journalId:text("journal_id"),
 payload:text("payload").notNull(),createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("tally_document_revision").on(t.ownerUserId,t.guid,t.revision),index("tally_document_current").on(t.ownerUserId,t.guid,t.createdAt)]);

export const tallyMasters=sqliteTable("tally_masters",{
 id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),
 kind:text("kind").notNull(),name:text("name").notNull(),topGroup:text("top_group"),
 unit:text("unit"),gstRateBasisPoints:integer("gst_rate_basis_points"),costPaise:integer("cost_paise"),
 updatedAt:integer("updated_at").notNull(),
},t=>[uniqueIndex("idx_tally_masters_owner_kind_name").on(t.ownerUserId,t.kind,t.name)]);

export const tallyBillAllocations=sqliteTable("tally_bill_allocations",{
 id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),documentId:text("document_id").notNull(),
 partyId:text("party_id").notNull(),partyType:text("party_type").notNull(),reference:text("reference").notNull(),
 amountPaise:integer("amount_paise").notNull(),allocationType:text("allocation_type").notNull(),date:text("date").notNull(),
},t=>[index("tally_bill_party_reference").on(t.ownerUserId,t.partyId,t.reference)]);

export const tallyBatchEffects=sqliteTable("tally_batch_effects",{
 id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),documentId:text("document_id").notNull(),batchId:text("batch_id").notNull(),quantityMilli:integer("quantity_milli").notNull(),
},t=>[index("tally_batch_document").on(t.ownerUserId,t.documentId)]);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    customerType: text("customer_type").notNull().default("business"),
    displayName: text("display_name").notNull(),
    nickname: text("nickname"),
    contactName: text("contact_name"),
    primaryPhone: text("primary_phone").notNull(),
    secondaryPhone: text("secondary_phone"),
    email: text("email"),
    gstRegistrationType: text("gst_registration_type")
      .notNull()
      .default("unregistered"),
    gstin: text("gstin"),
    pan: text("pan"),
    bankAccountLast4: text("bank_account_last4"),
    placeOfSupply: text("place_of_supply"),
    billingAddressLine1: text("billing_address_line_1"),
    billingAddressLine2: text("billing_address_line_2"),
    billingCity: text("billing_city"),
    billingState: text("billing_state"),
    billingPinCode: text("billing_pin_code"),
    shippingSameAsBilling: integer("shipping_same_as_billing", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    shippingAddressLine1: text("shipping_address_line_1"),
    shippingAddressLine2: text("shipping_address_line_2"),
    shippingCity: text("shipping_city"),
    shippingState: text("shipping_state"),
    shippingPinCode: text("shipping_pin_code"),
    creditDays: integer("credit_days").notNull().default(0),
    creditLimitPaise: integer("credit_limit_paise").notNull().default(0),
    openingBalancePaise: integer("opening_balance_paise").notNull().default(0),
    balanceType: text("balance_type").notNull().default("receivable"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_customers_owner_name").on(table.ownerUserId, table.displayName),
    uniqueIndex("idx_customers_owner_gstin").on(table.ownerUserId, table.gstin),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    itemType: text("item_type").notNull().default("product"),
    name: text("name").notNull(),
    sku: text("sku"),
    barcode: text("barcode"),
    category: text("category"),
    hsnSac: text("hsn_sac"),
    unit: text("unit").notNull().default("PCS"),
    purchasePricePaise: integer("purchase_price_paise").notNull().default(0),
    salePricePaise: integer("sale_price_paise").notNull().default(0),
    priceIncludesTax: integer("price_includes_tax", { mode: "boolean" })
      .notNull()
      .default(false),
    gstRateBasisPoints: integer("gst_rate_basis_points").notNull().default(0),
    cessRateBasisPoints: integer("cess_rate_basis_points").notNull().default(0),
    openingStockMilli: integer("opening_stock_milli").notNull().default(0),
    reorderLevelMilli: integer("reorder_level_milli").notNull().default(0),
    warehouse: text("warehouse"),
    supplier: text("supplier"),
    supplierId: text("supplier_id"),
    description: text("description"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_products_owner_name").on(table.ownerUserId, table.name),
    uniqueIndex("idx_products_owner_sku").on(table.ownerUserId, table.sku),
    index("idx_products_owner_supplier").on(
      table.ownerUserId,
      table.supplierId,
    ),
  ],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    primaryPhone: text("primary_phone").notNull(),
    secondaryPhone: text("secondary_phone"),
    email: text("email"),
    gstRegistrationType: text("gst_registration_type")
      .notNull()
      .default("unregistered"),
    gstin: text("gstin"),
    pan: text("pan"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    state: text("state"),
    pinCode: text("pin_code"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(0),
    openingPayablePaise: integer("opening_payable_paise").notNull().default(0),
    // Section 43B(h) of the Income Tax Act (in force from AY 2024-25): amounts owed to a
    // Micro or Small enterprise (not Medium) are disallowed as a deduction if unpaid
    // beyond the MSMED Act Section 15 limit (the agreed term, capped at 45 days). Tracking
    // this per supplier is what lets Commons flag at-risk unpaid bills before year-end.
    msmeCategory: text("msme_category").notNull().default("none"),
    udyamNumber: text("udyam_number"),
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_suppliers_owner_name").on(table.ownerUserId, table.name),
    uniqueIndex("idx_suppliers_owner_gstin").on(table.ownerUserId, table.gstin),
  ],
);

export const businessProfiles = sqliteTable(
  "business_profiles",
  {
    ownerUserId: text("owner_user_id").primaryKey(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    gstin: text("gstin"),
    pan: text("pan"),
    phone: text("phone"),
    email: text("email"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    state: text("state"),
    pinCode: text("pin_code"),
    bankName: text("bank_name"),
    accountName: text("account_name"),
    accountNumber: text("account_number"),
    ifsc: text("ifsc"),
    invoicePrefix: text("invoice_prefix").notNull().default("INV"),
    terms: text("terms"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_business_profiles_owner_gstin").on(
      table.ownerUserId,
      table.gstin,
    ),
  ],
);

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    role: text("role").notNull(),
    department: text("department"),
    employmentType: text("employment_type").notNull().default("full_time"),
    joiningDate: text("joining_date"),
    monthlySalaryPaise: integer("monthly_salary_paise").notNull().default(0),
    pan: text("pan"),
    aadhaarLast4: text("aadhaar_last_4"),
    address: text("address"),
    emergencyContact: text("emergency_contact"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_employees_owner_name").on(table.ownerUserId, table.name),
    index("idx_employees_owner_status").on(table.ownerUserId, table.status),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: text("invoice_date").notNull(),
    dueDate: text("due_date"),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull(),
    customerGstin: text("customer_gstin"),
    customerAddress: text("customer_address"),
    placeOfSupply: text("place_of_supply"),
    supplyType: text("supply_type").notNull().default("intra_state"),
    sellerLegalName: text("seller_legal_name"),
    sellerTradeName: text("seller_trade_name"),
    sellerGstin: text("seller_gstin"),
    sellerPan: text("seller_pan"),
    sellerAddress: text("seller_address"),
    sellerState: text("seller_state"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    cessPaise: integer("cess_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    paidPaise: integer("paid_paise").notNull().default(0),
    status: text("status").notNull().default("unpaid"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_invoices_owner_number").on(
      table.ownerUserId,
      table.invoiceNumber,
    ),
    index("idx_invoices_owner_date").on(table.ownerUserId, table.invoiceDate),
    index("idx_invoices_owner_customer").on(
      table.ownerUserId,
      table.customerId,
    ),
  ],
);

export const invoiceSequences = sqliteTable(
  "invoice_sequences",
  {
    ownerUserId: text("owner_user_id").notNull(),
    fiscalYear: text("fiscal_year").notNull(),
    prefix: text("prefix").notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_invoice_sequences_owner_year_prefix").on(
      table.ownerUserId,
      table.fiscalYear,
      table.prefix,
    ),
  ],
);

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    productId: text("product_id"),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    quantityMilli: integer("quantity_milli").notNull(),
    unit: text("unit").notNull(),
    ratePaise: integer("rate_paise").notNull(),
    gstRateBasisPoints: integer("gst_rate_basis_points").notNull().default(0),
    taxablePaise: integer("taxable_paise").notNull(),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("idx_invoice_items_invoice").on(table.invoiceId, table.position),
  ],
);

export const invoicePayments = sqliteTable(
  "invoice_payments",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull(),
    paymentDate: text("payment_date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    paymentMode: text("payment_mode").notNull(),
    reference: text("reference"),
    journalEntryId: text("journal_entry_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_invoice_payments_owner_date").on(table.ownerUserId, table.paymentDate),
    index("idx_invoice_payments_invoice").on(table.invoiceId),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    productId: text("product_id").notNull(),
    movementType: text("movement_type").notNull(),
    movementDate: text("movement_date").notNull(),
    quantityMilli: integer("quantity_milli").notNull(),
    unit: text("unit").notNull(),
    unitCostPaise: integer("unit_cost_paise").notNull().default(0),
    totalValuePaise: integer("total_value_paise").notNull().default(0),
    supplier: text("supplier"),
    reference: text("reference"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_stock_movements_owner_product_date").on(
      table.ownerUserId,
      table.productId,
      table.movementDate,
    ),
    index("idx_stock_movements_owner_reference").on(
      table.ownerUserId,
      table.reference,
    ),
  ],
);

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    purchaseNumber: text("purchase_number").notNull(),
    supplierId: text("supplier_id"),
    supplierName: text("supplier_name").notNull(),
    supplierGstin: text("supplier_gstin"),
    supplierInvoiceNumber: text("supplier_invoice_number"),
    purchaseDate: text("purchase_date").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    gstPaise: integer("gst_paise").notNull().default(0),
    itcEligible: integer("itc_eligible", { mode: "boolean" }).notNull().default(true),
    reverseCharge: integer("reverse_charge", { mode: "boolean" }).notNull().default(false),
    placeOfSupply: text("place_of_supply"),
    // TDS under Chapter XVII-B of the Income Tax Act (e.g. 194C contractors, 194J
    // professional fees, 194Q goods purchases above the threshold) is deducted from what's
    // paid to the supplier, not from the invoice value itself — tracked here so the
    // payable balance and TDS-payable liability both stay correct.
    tdsSectionCode: text("tds_section_code"),
    tdsRateBasisPoints: integer("tds_rate_basis_points"),
    tdsPaise: integer("tds_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    paidPaise: integer("paid_paise").notNull().default(0),
    status: text("status").notNull().default("received"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_purchases_owner_number").on(
      table.ownerUserId,
      table.purchaseNumber,
    ),
    index("idx_purchases_owner_date").on(table.ownerUserId, table.purchaseDate),
    index("idx_purchases_owner_supplier_date").on(
      table.ownerUserId,
      table.supplierId,
      table.purchaseDate,
    ),
  ],
);

export const purchasePayments = sqliteTable(
  "purchase_payments",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    purchaseId: text("purchase_id").notNull(),
    purchaseNumber: text("purchase_number").notNull(),
    supplierName: text("supplier_name").notNull(),
    paymentDate: text("payment_date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    paymentMode: text("payment_mode").notNull(),
    reference: text("reference"),
    journalEntryId: text("journal_entry_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_purchase_payments_owner_date").on(table.ownerUserId, table.paymentDate),
    index("idx_purchase_payments_purchase").on(table.purchaseId),
  ],
);

export const purchaseItems = sqliteTable(
  "purchase_items",
  {
    id: text("id").primaryKey(),
    purchaseId: text("purchase_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    productId: text("product_id").notNull(),
    description: text("description").notNull(),
    quantityMilli: integer("quantity_milli").notNull(),
    unit: text("unit").notNull(),
    unitCostPaise: integer("unit_cost_paise").notNull(),
    gstRateBasisPoints: integer("gst_rate_basis_points").notNull().default(0),
    taxablePaise: integer("taxable_paise").notNull(),
    gstPaise: integer("gst_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("idx_purchase_items_purchase").on(table.purchaseId, table.position),
  ],
);

export const gstFilingSessions = sqliteTable(
  "gst_filing_sessions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    returnType: text("return_type").notNull().default("GSTR-3B"),
    outputTaxPaise: integer("output_tax_paise").notNull().default(0),
    outputCessPaise: integer("output_cess_paise").notNull().default(0),
    booksInputGstPaise: integer("books_input_gst_paise").notNull().default(0),
    estimatedNetPaise: integer("estimated_net_paise").notNull().default(0),
    potentialCarryForwardPaise: integer("potential_carry_forward_paise")
      .notNull()
      .default(0),
    invoiceCount: integer("invoice_count").notNull().default(0),
    purchaseCount: integer("purchase_count").notNull().default(0),
    matched2bCount: integer("matched_2b_count").notNull().default(0),
    unmatched2bCount: integer("unmatched_2b_count").notNull().default(0),
    booksOnlyCount: integer("books_only_count").notNull().default(0),
    ineligibleItcPaise: integer("ineligible_itc_paise").notNull().default(0),
    issueCount: integer("issue_count").notNull().default(0),
    analysisMode: text("analysis_mode").notNull().default("analytical"),
    advice: text("advice"),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_gst_sessions_owner_period").on(
      table.ownerUserId,
      table.periodEnd,
    ),
  ],
);

export const gst2bEntries = sqliteTable("gst_2b_entries", {
  id:text("id").primaryKey(), ownerUserId:text("owner_user_id").notNull(), taxPeriod:text("tax_period").notNull(),
  supplierGstin:text("supplier_gstin").notNull(), supplierName:text("supplier_name"), invoiceNumber:text("invoice_number").notNull(), invoiceDate:text("invoice_date"),
  taxablePaise:integer("taxable_paise").notNull().default(0), igstPaise:integer("igst_paise").notNull().default(0), cgstPaise:integer("cgst_paise").notNull().default(0), sgstPaise:integer("sgst_paise").notNull().default(0), cessPaise:integer("cess_paise").notNull().default(0),
  matchStatus:text("match_status").notNull().default("unmatched"), matchedPurchaseId:text("matched_purchase_id"), createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("idx_gst2b_owner_period_doc").on(t.ownerUserId,t.taxPeriod,t.supplierGstin,t.invoiceNumber),index("idx_gst2b_owner_match").on(t.ownerUserId,t.taxPeriod,t.matchStatus)]);

export const fixedAssets = sqliteTable("fixed_assets", {
  id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),name:text("name").notNull(),category:text("category").notNull(),acquisitionDate:text("acquisition_date").notNull(),
  originalCostPaise:integer("original_cost_paise").notNull(),residualValuePaise:integer("residual_value_paise").notNull().default(0),usefulLifeMonths:integer("useful_life_months").notNull(),
  // WDV (written-down value) is the method Section 32 of the Income Tax Act actually
  // requires for most block-of-assets depreciation, as distinct from the SLM the books
  // may use under the Companies Act — recorded separately since a business commonly needs
  // both figures (book depreciation vs. tax depreciation) at year end.
  depreciationMethod:text("depreciation_method").notNull().default("slm"),
  wdvRateBasisPoints:integer("wdv_rate_basis_points"),
  accumulatedDepreciationPaise:integer("accumulated_depreciation_paise").notNull().default(0),lastDepreciationDate:text("last_depreciation_date"),paymentAccountCode:text("payment_account_code").notNull().default("2000"),status:text("status").notNull().default("active"),createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
},t=>[index("idx_fixed_assets_owner_date").on(t.ownerUserId,t.acquisitionDate),index("idx_fixed_assets_owner_status").on(t.ownerUserId,t.status)]);

export const yearEndClosures = sqliteTable("year_end_closures", {
  id:text("id").primaryKey(),ownerUserId:text("owner_user_id").notNull(),fiscalYear:text("fiscal_year").notNull(),periodStart:text("period_start").notNull(),periodEnd:text("period_end").notNull(),profitPaise:integer("profit_paise").notNull(),journalEntryId:text("journal_entry_id").notNull(),closedBy:text("closed_by").notNull(),createdAt:integer("created_at").notNull(),
},t=>[uniqueIndex("idx_year_end_owner_year").on(t.ownerUserId,t.fiscalYear)]);

export const receivableSettings = sqliteTable("receivable_settings", {
  ownerUserId: text("owner_user_id").primaryKey(),
  overdueDays: integer("overdue_days").notNull().default(7),
  minimumOutstandingPaise: integer("minimum_outstanding_paise")
    .notNull()
    .default(500000),
  preferredChannel: text("preferred_channel").notNull().default("both"),
  messageTemplate: text("message_template").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const reminderLogs = sqliteTable(
  "reminder_logs",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull(),
    channel: text("channel").notNull(),
    outstandingPaise: integer("outstanding_paise").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("opened"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_reminders_owner_customer_date").on(
      table.ownerUserId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

export const paymentAdvances = sqliteTable(
  "payment_advances",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    advanceType: text("advance_type").notNull(),
    partyId: text("party_id"),
    partyName: text("party_name").notNull(),
    advanceDate: text("advance_date").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    appliedPaise: integer("applied_paise").notNull().default(0),
    paymentMode: text("payment_mode").notNull().default("bank_transfer"),
    reference: text("reference"),
    purpose: text("purpose"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_advances_owner_date").on(table.ownerUserId, table.advanceDate),
    index("idx_advances_owner_party").on(
      table.ownerUserId,
      table.partyId,
    ),
  ],
);

export const payrollEntries = sqliteTable(
  "payroll_entries",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    employeeKey: text("employee_key").notNull(),
    employeeName: text("employee_name").notNull(),
    salaryMonth: text("salary_month").notNull(),
    baseSalaryPaise: integer("base_salary_paise").notNull(),
    bonusPaise: integer("bonus_paise").notNull().default(0),
    advanceDeductionPaise: integer("advance_deduction_paise")
      .notNull()
      .default(0),
    otherDeductionPaise: integer("other_deduction_paise")
      .notNull()
      .default(0),
    netPayPaise: integer("net_pay_paise").notNull(),
    paymentDate: text("payment_date"),
    paymentMode: text("payment_mode"),
    reference: text("reference"),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_payroll_owner_employee_month").on(
      table.ownerUserId,
      table.employeeKey,
      table.salaryMonth,
    ),
    index("idx_payroll_owner_month").on(table.ownerUserId, table.salaryMonth),
  ],
);

export const bankImportBatches = sqliteTable(
  "bank_import_batches",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    sourceFilename: text("source_filename").notNull(),
    statementAccountLast4: text("statement_account_last4"),
    importedCount: integer("imported_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    unmatchedCount: integer("unmatched_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_bank_batches_owner_date").on(
      table.ownerUserId,
      table.createdAt,
    ),
  ],
);

export const bankTransactions = sqliteTable(
  "bank_transactions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    importBatchId: text("import_batch_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    statementAccountLast4: text("statement_account_last4"),
    counterpartyAccountLast4: text("counterparty_account_last4"),
    transactionDate: text("transaction_date").notNull(),
    valueDate: text("value_date"),
    direction: text("direction").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    description: text("description"),
    reference: text("reference"),
    matchedEntityType: text("matched_entity_type"),
    matchedEntityId: text("matched_entity_id"),
    matchedEntityName: text("matched_entity_name"),
    matchConfidence: text("match_confidence"),
    matchReason: text("match_reason"),
    status: text("status").notNull().default("unmatched"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_bank_tx_owner_fingerprint").on(
      table.ownerUserId,
      table.fingerprint,
    ),
    index("idx_bank_tx_owner_status_date").on(
      table.ownerUserId,
      table.status,
      table.transactionDate,
    ),
    index("idx_bank_tx_owner_match").on(
      table.ownerUserId,
      table.matchedEntityId,
    ),
  ],
);

export const ledgerAccounts = sqliteTable(
  "ledger_accounts",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    normalSide: text("normal_side").notNull(),
    systemKey: text("system_key"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_ledger_accounts_owner_code").on(table.ownerUserId, table.code),
    uniqueIndex("idx_ledger_accounts_owner_system").on(table.ownerUserId, table.systemKey),
    index("idx_ledger_accounts_owner_category").on(table.ownerUserId, table.category),
  ],
);

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    entryNumber: text("entry_number").notNull(),
    entryDate: text("entry_date").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    description: text("description").notNull(),
    status: text("status").notNull().default("posted"),
    createdBy: text("created_by").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_journal_entries_owner_number").on(table.ownerUserId, table.entryNumber),
    index("idx_journal_entries_owner_date").on(table.ownerUserId, table.entryDate),
    index("idx_journal_entries_owner_source").on(table.ownerUserId, table.sourceType, table.sourceId),
  ],
);

export const journalLines = sqliteTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    debitPaise: integer("debit_paise").notNull().default(0),
    creditPaise: integer("credit_paise").notNull().default(0),
    partyType: text("party_type"),
    partyId: text("party_id"),
    partyName: text("party_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("idx_journal_lines_entry").on(table.entryId),
    index("idx_journal_lines_owner_account").on(table.ownerUserId, table.accountCode),
    index("idx_journal_lines_owner_party").on(table.ownerUserId, table.partyId),
  ],
);

export const adjustmentDocuments = sqliteTable(
  "adjustment_documents",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    documentNumber: text("document_number").notNull(),
    documentType: text("document_type").notNull(),
    documentDate: text("document_date").notNull(),
    originalReference: text("original_reference"),
    partyId: text("party_id"),
    partyName: text("party_name").notNull(),
    productId: text("product_id"),
    quantityMilli: integer("quantity_milli").notNull().default(0),
    taxablePaise: integer("taxable_paise").notNull(),
    gstPaise: integer("gst_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("posted"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_adjustments_owner_number").on(table.ownerUserId, table.documentNumber),
    index("idx_adjustments_owner_date").on(table.ownerUserId, table.documentDate),
  ],
);

export const warehouses = sqliteTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_warehouses_owner_code").on(table.ownerUserId, table.code),
    index("idx_warehouses_owner_name").on(table.ownerUserId, table.name),
  ],
);

export const inventoryBatches = sqliteTable(
  "inventory_batches",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    warehouseId: text("warehouse_id").notNull(),
    warehouseName: text("warehouse_name").notNull(),
    batchNumber: text("batch_number").notNull(),
    manufacturedDate: text("manufactured_date"),
    expiryDate: text("expiry_date"),
    quantityMilli: integer("quantity_milli").notNull(),
    unit: text("unit").notNull(),
    unitCostPaise: integer("unit_cost_paise").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_batches_owner_product_warehouse_batch").on(table.ownerUserId, table.productId, table.warehouseId, table.batchNumber),
    index("idx_batches_owner_expiry").on(table.ownerUserId, table.expiryDate),
  ],
);

export const periodLocks = sqliteTable(
  "period_locks",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    reason: text("reason").notNull(),
    lockedBy: text("locked_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_period_locks_owner_dates").on(table.ownerUserId, table.periodStart, table.periodEnd)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_audit_events_owner_hash").on(table.ownerUserId, table.eventHash),
    index("idx_audit_events_owner_date").on(table.ownerUserId, table.createdAt),
  ],
);

export const backupSnapshots = sqliteTable(
  "backup_snapshots",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    recordCount: integer("record_count").notNull().default(0),
    status: text("status").notNull().default("verified"),
    note: text("note"),
    data: text("data"),
    checksum: text("checksum"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_backup_snapshots_owner_date").on(table.ownerUserId, table.createdAt)],
);

export const businessMembers = sqliteTable(
  "business_members",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("operator"),
    status: text("status").notNull().default("invited"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("idx_business_members_owner_email").on(table.ownerUserId, table.email)],
);

export const complianceConnections = sqliteTable("compliance_connections", {
  ownerUserId: text("owner_user_id").primaryKey(),
  gstStatus: text("gst_status").notNull().default("not_connected"),
  einvoiceStatus: text("einvoice_status").notNull().default("not_connected"),
  ewayBillStatus: text("eway_bill_status").notNull().default("not_connected"),
  lastCheckedAt: integer("last_checked_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
