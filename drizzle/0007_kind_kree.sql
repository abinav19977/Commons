CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`primary_phone` text NOT NULL,
	`secondary_phone` text,
	`email` text,
	`gst_registration_type` text DEFAULT 'unregistered' NOT NULL,
	`gstin` text,
	`pan` text,
	`address_line_1` text,
	`address_line_2` text,
	`city` text,
	`state` text,
	`pin_code` text,
	`payment_terms_days` integer DEFAULT 0 NOT NULL,
	`opening_payable_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_suppliers_owner_name` ON `suppliers` (`owner_user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_suppliers_owner_gstin` ON `suppliers` (`owner_user_id`,`gstin`);--> statement-breakpoint
ALTER TABLE `products` ADD `supplier_id` text;--> statement-breakpoint
CREATE INDEX `idx_products_owner_supplier` ON `products` (`owner_user_id`,`supplier_id`);--> statement-breakpoint
ALTER TABLE `purchases` ADD `supplier_id` text;--> statement-breakpoint
CREATE INDEX `idx_purchases_owner_supplier_date` ON `purchases` (`owner_user_id`,`supplier_id`,`purchase_date`);