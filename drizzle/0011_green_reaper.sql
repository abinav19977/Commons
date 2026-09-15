CREATE TABLE `adjustment_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_number` text NOT NULL,
	`document_type` text NOT NULL,
	`document_date` text NOT NULL,
	`original_reference` text,
	`party_id` text,
	`party_name` text NOT NULL,
	`product_id` text,
	`quantity_milli` integer DEFAULT 0 NOT NULL,
	`taxable_paise` integer NOT NULL,
	`gst_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_adjustments_owner_number` ON `adjustment_documents` (`owner_user_id`,`document_number`);--> statement-breakpoint
CREATE INDEX `idx_adjustments_owner_date` ON `adjustment_documents` (`owner_user_id`,`document_date`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`summary` text NOT NULL,
	`previous_hash` text,
	`event_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audit_events_owner_hash` ON `audit_events` (`owner_user_id`,`event_hash`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_owner_date` ON `audit_events` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backup_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'verified' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_backup_snapshots_owner_date` ON `backup_snapshots` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `business_members` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'operator' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_members_owner_email` ON `business_members` (`owner_user_id`,`email`);--> statement-breakpoint
CREATE TABLE `compliance_connections` (
	`owner_user_id` text PRIMARY KEY NOT NULL,
	`gst_status` text DEFAULT 'not_connected' NOT NULL,
	`einvoice_status` text DEFAULT 'not_connected' NOT NULL,
	`eway_bill_status` text DEFAULT 'not_connected' NOT NULL,
	`last_checked_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`warehouse_name` text NOT NULL,
	`batch_number` text NOT NULL,
	`manufactured_date` text,
	`expiry_date` text,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_cost_paise` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_batches_owner_product_warehouse_batch` ON `inventory_batches` (`owner_user_id`,`product_id`,`warehouse_id`,`batch_number`);--> statement-breakpoint
CREATE INDEX `idx_batches_owner_expiry` ON `inventory_batches` (`owner_user_id`,`expiry_date`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`entry_number` text NOT NULL,
	`entry_date` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`description` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_by` text NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_journal_entries_owner_number` ON `journal_entries` (`owner_user_id`,`entry_number`);--> statement-breakpoint
CREATE INDEX `idx_journal_entries_owner_date` ON `journal_entries` (`owner_user_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_journal_entries_owner_source` ON `journal_entries` (`owner_user_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`account_code` text NOT NULL,
	`account_name` text NOT NULL,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`party_type` text,
	`party_id` text,
	`party_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_journal_lines_entry` ON `journal_lines` (`entry_id`);--> statement-breakpoint
CREATE INDEX `idx_journal_lines_owner_account` ON `journal_lines` (`owner_user_id`,`account_code`);--> statement-breakpoint
CREATE INDEX `idx_journal_lines_owner_party` ON `journal_lines` (`owner_user_id`,`party_id`);--> statement-breakpoint
CREATE TABLE `ledger_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`normal_side` text NOT NULL,
	`system_key` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ledger_accounts_owner_code` ON `ledger_accounts` (`owner_user_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ledger_accounts_owner_system` ON `ledger_accounts` (`owner_user_id`,`system_key`);--> statement-breakpoint
CREATE INDEX `idx_ledger_accounts_owner_category` ON `ledger_accounts` (`owner_user_id`,`category`);--> statement-breakpoint
CREATE TABLE `period_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`reason` text NOT NULL,
	`locked_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_period_locks_owner_dates` ON `period_locks` (`owner_user_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_warehouses_owner_code` ON `warehouses` (`owner_user_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_warehouses_owner_name` ON `warehouses` (`owner_user_id`,`name`);