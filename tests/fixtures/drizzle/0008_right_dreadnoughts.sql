CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_data` text NOT NULL,
	`after_data` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_audit_created` ON `admin_audit` (`created`,`id`);