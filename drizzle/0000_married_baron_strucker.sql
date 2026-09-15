CREATE TABLE `business_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`business_name` text NOT NULL,
	`business_type` text NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_business_profiles_user_id` ON `business_profiles` (`user_id`);