CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'mr' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`territory` text DEFAULT '' NOT NULL,
	`target` integer DEFAULT 400000 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`module` text NOT NULL,
	`record_id` text,
	`created` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created` ON `notifications` (`recipient`,`created`);--> statement-breakpoint
ALTER TABLE `records` ADD `assigned_to` text DEFAULT '' NOT NULL;