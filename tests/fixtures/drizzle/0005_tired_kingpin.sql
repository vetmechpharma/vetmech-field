CREATE TABLE `ledger_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`stock` integer DEFAULT 1 NOT NULL,
	`benefit` integer DEFAULT 1 NOT NULL,
	`gift` integer DEFAULT 1 NOT NULL,
	`commitment` integer DEFAULT 1 NOT NULL,
	`attendance` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "INSUFFICIENT_STOCK" CHECK("ledger_guards"."stock"=1),
	CONSTRAINT "INSUFFICIENT_ALLOTMENT" CHECK("ledger_guards"."benefit"=1),
	CONSTRAINT "GIFT_ALREADY_SUPPLIED" CHECK("ledger_guards"."gift"=1),
	CONSTRAINT "COMMITMENT_EXCEEDED" CHECK("ledger_guards"."commitment"=1),
	CONSTRAINT "ATTENDANCE_REQUIRED" CHECK("ledger_guards"."attendance"=1)
);
