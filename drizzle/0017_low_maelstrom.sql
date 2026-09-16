CREATE TABLE `invoice_sequences` (
	`owner_user_id` text NOT NULL,
	`fiscal_year` text NOT NULL,
	`prefix` text NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoice_sequences_owner_year_prefix` ON `invoice_sequences` (`owner_user_id`,`fiscal_year`,`prefix`);--> statement-breakpoint
CREATE TABLE `purchase_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`purchase_id` text NOT NULL,
	`purchase_number` text NOT NULL,
	`supplier_name` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`payment_mode` text NOT NULL,
	`reference` text,
	`journal_entry_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_payments_owner_date` ON `purchase_payments` (`owner_user_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_purchase_payments_purchase` ON `purchase_payments` (`purchase_id`);--> statement-breakpoint
ALTER TABLE `purchases` ADD `paid_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
