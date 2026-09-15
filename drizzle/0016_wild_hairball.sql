CREATE TABLE `tally_batch_effects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`quantity_milli` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tally_batch_document` ON `tally_batch_effects` (`owner_user_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `tally_bill_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`party_id` text NOT NULL,
	`party_type` text NOT NULL,
	`reference` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`allocation_type` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tally_bill_party_reference` ON `tally_bill_allocations` (`owner_user_id`,`party_id`,`reference`);--> statement-breakpoint
CREATE TABLE `tally_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`guid` text NOT NULL,
	`revision` text NOT NULL,
	`kind` text NOT NULL,
	`local_id` text,
	`journal_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tally_document_revision` ON `tally_documents` (`owner_user_id`,`guid`,`revision`);--> statement-breakpoint
CREATE INDEX `tally_document_current` ON `tally_documents` (`owner_user_id`,`guid`,`created_at`);