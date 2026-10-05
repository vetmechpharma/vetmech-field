CREATE TABLE `mr_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`mr_email` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mr_drafts_owner_status` ON `mr_drafts` (`mr_email`,`status`);