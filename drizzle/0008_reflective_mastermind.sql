CREATE TABLE `gst_filing_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`return_type` text DEFAULT 'GSTR-3B' NOT NULL,
	`output_tax_paise` integer DEFAULT 0 NOT NULL,
	`output_cess_paise` integer DEFAULT 0 NOT NULL,
	`books_input_gst_paise` integer DEFAULT 0 NOT NULL,
	`estimated_net_paise` integer DEFAULT 0 NOT NULL,
	`potential_carry_forward_paise` integer DEFAULT 0 NOT NULL,
	`invoice_count` integer DEFAULT 0 NOT NULL,
	`purchase_count` integer DEFAULT 0 NOT NULL,
	`issue_count` integer DEFAULT 0 NOT NULL,
	`analysis_mode` text DEFAULT 'analytical' NOT NULL,
	`advice` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_gst_sessions_owner_period` ON `gst_filing_sessions` (`owner_user_id`,`period_end`);--> statement-breakpoint
CREATE TABLE `receivable_settings` (
	`owner_user_id` text PRIMARY KEY NOT NULL,
	`overdue_days` integer DEFAULT 7 NOT NULL,
	`minimum_outstanding_paise` integer DEFAULT 500000 NOT NULL,
	`preferred_channel` text DEFAULT 'both' NOT NULL,
	`message_template` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminder_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`customer_id` text,
	`customer_name` text NOT NULL,
	`channel` text NOT NULL,
	`outstanding_paise` integer NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'opened' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reminders_owner_customer_date` ON `reminder_logs` (`owner_user_id`,`customer_id`,`created_at`);