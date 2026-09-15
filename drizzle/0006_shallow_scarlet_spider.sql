CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_cost_paise` integer NOT NULL,
	`gst_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`taxable_paise` integer NOT NULL,
	`gst_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_items_purchase` ON `purchase_items` (`purchase_id`,`position`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`purchase_number` text NOT NULL,
	`supplier_name` text NOT NULL,
	`supplier_gstin` text,
	`supplier_invoice_number` text,
	`purchase_date` text NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`gst_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchases_owner_number` ON `purchases` (`owner_user_id`,`purchase_number`);--> statement-breakpoint
CREATE INDEX `idx_purchases_owner_date` ON `purchases` (`owner_user_id`,`purchase_date`);