CREATE TABLE `followup_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`mr_email` text NOT NULL,
	`customer_id` text NOT NULL,
	`source` text NOT NULL,
	`due` text NOT NULL,
	`notes` text NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `period_events` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`action` text NOT NULL,
	`admin_email` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `period_locks` (
	`month` text PRIMARY KEY NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL,
	`closure_id` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL,
	`admin_email` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `period_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`closure_id` text NOT NULL,
	`month` text NOT NULL,
	`mr_email` text NOT NULL,
	`report` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`stockist_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mr_email` text NOT NULL,
	`record_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`created` text NOT NULL,
	`reviewed` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `status` text DEFAULT 'Delivered' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `accepted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_guards` ADD `period` integer NOT NULL DEFAULT 1 CONSTRAINT PERIOD_CLOSED CHECK(period=1);
--> statement-breakpoint
ALTER TABLE `ledger_guards` ADD `version` integer NOT NULL DEFAULT 1 CONSTRAINT STALE_REVIEW CHECK(version=1);
