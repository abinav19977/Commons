CREATE TABLE `business_profiles` (
	`owner_user_id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`gstin` text,
	`pan` text,
	`phone` text,
	`email` text,
	`address_line_1` text,
	`address_line_2` text,
	`city` text,
	`state` text,
	`pin_code` text,
	`bank_name` text,
	`account_name` text,
	`account_number` text,
	`ifsc` text,
	`invoice_prefix` text DEFAULT 'INV' NOT NULL,
	`terms` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_profiles_owner_gstin` ON `business_profiles` (`owner_user_id`,`gstin`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`department` text,
	`employment_type` text DEFAULT 'full_time' NOT NULL,
	`joining_date` text,
	`monthly_salary_paise` integer DEFAULT 0 NOT NULL,
	`pan` text,
	`aadhaar_last_4` text,
	`address` text,
	`emergency_contact` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employees_owner_name` ON `employees` (`owner_user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_employees_owner_status` ON `employees` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`product_id` text,
	`description` text NOT NULL,
	`hsn_sac` text,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`rate_paise` integer NOT NULL,
	`gst_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`taxable_paise` integer NOT NULL,
	`tax_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice` ON `invoice_items` (`invoice_id`,`position`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_date` text NOT NULL,
	`due_date` text,
	`customer_id` text,
	`customer_name` text NOT NULL,
	`customer_gstin` text,
	`customer_address` text,
	`place_of_supply` text,
	`supply_type` text DEFAULT 'intra_state' NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`cess_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_owner_number` ON `invoices` (`owner_user_id`,`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_invoices_owner_date` ON `invoices` (`owner_user_id`,`invoice_date`);--> statement-breakpoint
CREATE INDEX `idx_invoices_owner_customer` ON `invoices` (`owner_user_id`,`customer_id`);