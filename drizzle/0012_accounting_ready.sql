CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`customer_name` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`payment_mode` text NOT NULL,
	`reference` text,
	`journal_entry_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_payments_owner_date` ON `invoice_payments` (`owner_user_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_invoice_payments_invoice` ON `invoice_payments` (`invoice_id`);
