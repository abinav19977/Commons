CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`account_user_id` text NOT NULL,
	`slot` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "companies_five_slots" CHECK("companies"."slot" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_account_slot_unique` ON `companies` (`account_user_id`,`slot`);
