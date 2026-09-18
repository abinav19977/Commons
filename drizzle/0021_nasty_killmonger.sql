CREATE TABLE `tally_masters` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`top_group` text,
	`unit` text,
	`gst_rate_basis_points` integer,
	`cost_paise` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tally_masters_owner_kind_name` ON `tally_masters` (`owner_user_id`,`kind`,`name`);