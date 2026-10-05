ALTER TABLE `members` ADD `mr_type` text DEFAULT 'Medical Representative' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `district` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `headquarters` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `route` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `employee_code` text DEFAULT '' NOT NULL;