CREATE TABLE `fixed_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`acquisition_date` text NOT NULL,
	`original_cost_paise` integer NOT NULL,
	`residual_value_paise` integer DEFAULT 0 NOT NULL,
	`useful_life_months` integer NOT NULL,
	`accumulated_depreciation_paise` integer DEFAULT 0 NOT NULL,
	`last_depreciation_date` text,
	`payment_account_code` text DEFAULT '2000' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fixed_assets_owner_date` ON `fixed_assets` (`owner_user_id`,`acquisition_date`);--> statement-breakpoint
CREATE INDEX `idx_fixed_assets_owner_status` ON `fixed_assets` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `gst_2b_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`tax_period` text NOT NULL,
	`supplier_gstin` text NOT NULL,
	`supplier_name` text,
	`invoice_number` text NOT NULL,
	`invoice_date` text,
	`taxable_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`cess_paise` integer DEFAULT 0 NOT NULL,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`matched_purchase_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_gst2b_owner_period_doc` ON `gst_2b_entries` (`owner_user_id`,`tax_period`,`supplier_gstin`,`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_gst2b_owner_match` ON `gst_2b_entries` (`owner_user_id`,`tax_period`,`match_status`);--> statement-breakpoint
CREATE TABLE `year_end_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`fiscal_year` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`profit_paise` integer NOT NULL,
	`journal_entry_id` text NOT NULL,
	`closed_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_year_end_owner_year` ON `year_end_closures` (`owner_user_id`,`fiscal_year`);--> statement-breakpoint
ALTER TABLE `gst_filing_sessions` ADD `matched_2b_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gst_filing_sessions` ADD `unmatched_2b_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gst_filing_sessions` ADD `books_only_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gst_filing_sessions` ADD `ineligible_itc_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `itc_eligible` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `reverse_charge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `place_of_supply` text;--> statement-breakpoint
CREATE TRIGGER `invoice_paid_guard` BEFORE UPDATE OF `paid_paise` ON `invoices`
WHEN NEW.`paid_paise` < 0 OR NEW.`paid_paise` > NEW.`total_paise`
BEGIN SELECT RAISE(ABORT, 'INVOICE_PAYMENT_OUT_OF_RANGE'); END;--> statement-breakpoint
CREATE TRIGGER `purchase_paid_guard` BEFORE UPDATE OF `paid_paise` ON `purchases`
WHEN NEW.`paid_paise` < 0 OR NEW.`paid_paise` > NEW.`total_paise`
BEGIN SELECT RAISE(ABORT, 'PURCHASE_PAYMENT_OUT_OF_RANGE'); END;--> statement-breakpoint
CREATE TRIGGER `asset_depreciation_guard` BEFORE UPDATE OF `accumulated_depreciation_paise` ON `fixed_assets`
WHEN NEW.`accumulated_depreciation_paise` < 0 OR NEW.`accumulated_depreciation_paise` > NEW.`original_cost_paise` - NEW.`residual_value_paise`
BEGIN SELECT RAISE(ABORT, 'ASSET_DEPRECIATION_OUT_OF_RANGE'); END;
