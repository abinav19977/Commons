ALTER TABLE `backup_snapshots` ADD `data` text;--> statement-breakpoint
ALTER TABLE `backup_snapshots` ADD `checksum` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_legal_name` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_trade_name` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_gstin` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_pan` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_address` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_state` text;