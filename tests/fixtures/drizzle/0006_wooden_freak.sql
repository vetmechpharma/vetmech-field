CREATE TABLE `order_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`revision` integer NOT NULL,
	`mr_email` text NOT NULL,
	`before_data` text NOT NULL,
	`after_data` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_edits_invoice_revision` ON `order_edits` (`invoice_id`,`revision`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `revision` integer DEFAULT 1 NOT NULL;