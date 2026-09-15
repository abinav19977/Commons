CREATE TABLE `bank_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`source_filename` text NOT NULL,
	`statement_account_last4` text,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`matched_count` integer DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`unmatched_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bank_batches_owner_date` ON `bank_import_batches` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`import_batch_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`statement_account_last4` text,
	`counterparty_account_last4` text,
	`transaction_date` text NOT NULL,
	`value_date` text,
	`direction` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`description` text,
	`reference` text,
	`matched_entity_type` text,
	`matched_entity_id` text,
	`matched_entity_name` text,
	`match_confidence` text,
	`match_reason` text,
	`status` text DEFAULT 'unmatched' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bank_tx_owner_fingerprint` ON `bank_transactions` (`owner_user_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_bank_tx_owner_status_date` ON `bank_transactions` (`owner_user_id`,`status`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_bank_tx_owner_match` ON `bank_transactions` (`owner_user_id`,`matched_entity_id`);--> statement-breakpoint
ALTER TABLE `customers` ADD `nickname` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `bank_account_last4` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `paid_paise` integer DEFAULT 0 NOT NULL;