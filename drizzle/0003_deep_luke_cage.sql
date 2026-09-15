CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`item_type` text DEFAULT 'product' NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`barcode` text,
	`category` text,
	`hsn_sac` text,
	`unit` text DEFAULT 'PCS' NOT NULL,
	`purchase_price_paise` integer DEFAULT 0 NOT NULL,
	`sale_price_paise` integer DEFAULT 0 NOT NULL,
	`price_includes_tax` integer DEFAULT false NOT NULL,
	`gst_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`cess_rate_basis_points` integer DEFAULT 0 NOT NULL,
	`opening_stock_milli` integer DEFAULT 0 NOT NULL,
	`reorder_level_milli` integer DEFAULT 0 NOT NULL,
	`warehouse` text,
	`supplier` text,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_products_owner_name` ON `products` (`owner_user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_owner_sku` ON `products` (`owner_user_id`,`sku`);