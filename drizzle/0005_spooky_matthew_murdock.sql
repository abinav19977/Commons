CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`movement_date` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit` text NOT NULL,
	`unit_cost_paise` integer DEFAULT 0 NOT NULL,
	`total_value_paise` integer DEFAULT 0 NOT NULL,
	`supplier` text,
	`reference` text,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stock_movements_owner_product_date` ON `stock_movements` (`owner_user_id`,`product_id`,`movement_date`);--> statement-breakpoint
CREATE INDEX `idx_stock_movements_owner_reference` ON `stock_movements` (`owner_user_id`,`reference`);