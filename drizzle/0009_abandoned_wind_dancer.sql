CREATE TABLE `payment_advances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`advance_type` text NOT NULL,
	`party_id` text,
	`party_name` text NOT NULL,
	`advance_date` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`applied_paise` integer DEFAULT 0 NOT NULL,
	`payment_mode` text DEFAULT 'bank_transfer' NOT NULL,
	`reference` text,
	`purpose` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_advances_owner_date` ON `payment_advances` (`owner_user_id`,`advance_date`);--> statement-breakpoint
CREATE INDEX `idx_advances_owner_party` ON `payment_advances` (`owner_user_id`,`party_id`);--> statement-breakpoint
CREATE TABLE `payroll_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`employee_key` text NOT NULL,
	`employee_name` text NOT NULL,
	`salary_month` text NOT NULL,
	`base_salary_paise` integer NOT NULL,
	`bonus_paise` integer DEFAULT 0 NOT NULL,
	`advance_deduction_paise` integer DEFAULT 0 NOT NULL,
	`other_deduction_paise` integer DEFAULT 0 NOT NULL,
	`net_pay_paise` integer NOT NULL,
	`payment_date` text,
	`payment_mode` text,
	`reference` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payroll_owner_employee_month` ON `payroll_entries` (`owner_user_id`,`employee_key`,`salary_month`);--> statement-breakpoint
CREATE INDEX `idx_payroll_owner_month` ON `payroll_entries` (`owner_user_id`,`salary_month`);