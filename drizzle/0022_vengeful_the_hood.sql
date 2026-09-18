ALTER TABLE `fixed_assets` ADD `depreciation_method` text DEFAULT 'slm' NOT NULL;--> statement-breakpoint
ALTER TABLE `fixed_assets` ADD `wdv_rate_basis_points` integer;--> statement-breakpoint
ALTER TABLE `purchases` ADD `tds_section_code` text;--> statement-breakpoint
ALTER TABLE `purchases` ADD `tds_rate_basis_points` integer;--> statement-breakpoint
ALTER TABLE `purchases` ADD `tds_paise` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `msme_category` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `udyam_number` text;