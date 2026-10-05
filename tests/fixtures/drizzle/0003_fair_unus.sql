CREATE TABLE `credentials` (
	`email` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credentials_username_unique` ON `credentials` (`username`);--> statement-breakpoint
CREATE TABLE `login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_email` ON `sessions` (`email`);--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `sessions` (`expires`);
--> statement-breakpoint
INSERT INTO members (email,user_id,name,role,status,territory,target,created) VALUES ('vetmechpharma@gmail.com','app-admin','Dr. T. Lokesh','admin','active','All territories',400000,datetime('now')) ON CONFLICT(email) DO UPDATE SET user_id=COALESCE(members.user_id,excluded.user_id);
--> statement-breakpoint
INSERT INTO credentials (email,username,password_hash,updated) VALUES ('vetmechpharma@gmail.com','admin','pbkdf2-sha512$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',datetime('now'));
--> statement-breakpoint
INSERT INTO members (email,user_id,name,role,status,territory,target,created) VALUES ('test-mr@vetmech.invalid','vetmech-test-mr','Test MR','mr','active','Test territory',400000,datetime('now')) ON CONFLICT(email) DO UPDATE SET user_id=COALESCE(members.user_id,excluded.user_id);
--> statement-breakpoint
INSERT INTO credentials (email,username,password_hash,updated) VALUES ('test-mr@vetmech.invalid','mrtest','pbkdf2-sha512$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000',datetime('now'));
