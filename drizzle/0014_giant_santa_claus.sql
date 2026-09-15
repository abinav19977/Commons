CREATE TABLE `tally_bridges` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`tally_name` text NOT NULL,
	`tally_guid` text,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`last_seen` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tally_bridge_owner` ON `tally_bridges` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tally_bridge_token` ON `tally_bridges` (`token_hash`);--> statement-breakpoint
CREATE TABLE `tally_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`bridge_id` text NOT NULL,
	`direction` text NOT NULL,
	`source_key` text NOT NULL,
	`label` text NOT NULL,
	`xml` text NOT NULL,
	`digest` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tally_transfer_source` ON `tally_transfers` (`bridge_id`,`direction`,`source_key`);--> statement-breakpoint
CREATE INDEX `tally_transfer_queue` ON `tally_transfers` (`bridge_id`,`direction`,`status`);