CREATE TABLE `tally_import_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`source_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tally_import_once` ON `tally_import_receipts` (`owner_user_id`,`source_key`);