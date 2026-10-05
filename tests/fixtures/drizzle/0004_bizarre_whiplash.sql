CREATE TABLE `benefit_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mr_email` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `benefit_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`movement` text NOT NULL,
	`mr_email` text NOT NULL,
	`item_id` text NOT NULL,
	`customer_id` text DEFAULT '' NOT NULL,
	`visit_id` text DEFAULT '' NOT NULL,
	`quantity` integer NOT NULL,
	`cost` integer NOT NULL,
	`gps` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`mr_email` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`fulfilled` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`stockist_id` text NOT NULL,
	`customer_id` text DEFAULT '' NOT NULL,
	`mr_email` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`items` text NOT NULL,
	`subtotal` integer NOT NULL,
	`total` integer NOT NULL,
	`visit_id` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `invoices_stockist` ON `invoices` (`stockist_id`);--> statement-breakpoint
CREATE INDEX `invoices_mr` ON `invoices` (`mr_email`);--> statement-breakpoint
CREATE TABLE `stock_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`stockist_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`stockist_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visit_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`mr_email` text NOT NULL,
	`closed_at` text NOT NULL,
	`gps` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`mr_email` text NOT NULL,
	`phone` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'awaiting_setup' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
ALTER TABLE `members` ADD `route_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `district_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `stockist_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX benefit_history_customer_item ON benefit_movements(customer_id,item_id,movement);
--> statement-breakpoint
CREATE INDEX benefits_mr ON benefit_movements(mr_email,kind);
--> statement-breakpoint
UPDATE members SET route_ids=COALESCE((SELECT json_group_array(id) FROM records WHERE kind='Routes' AND json_extract(data,'$.Name')=members.route),'[]'),district_ids=COALESCE((SELECT json_group_array(id) FROM records WHERE kind='Districts' AND json_extract(data,'$.Name')=members.district),'[]');
--> statement-breakpoint
UPDATE records SET data=json_set(data,'$."Route ID"',(SELECT r.id FROM records r WHERE r.kind='Routes' AND json_extract(r.data,'$.Name')=json_extract(records.data,'$.Route'))) WHERE kind='Customers' AND EXISTS(SELECT 1 FROM records r WHERE r.kind='Routes' AND json_extract(r.data,'$.Name')=json_extract(records.data,'$.Route'));
--> statement-breakpoint
INSERT INTO benefit_balances(id,kind,mr_email,item_id,quantity,value)
 SELECT 'sample|'||s.assigned_to||'|'||p.id,'sample',s.assigned_to,p.id,MAX(0,SUM(CASE WHEN json_extract(s.data,'$.Movement')='Issued to rep' THEN CAST(json_extract(s.data,'$.Quantity') AS INTEGER) ELSE -CAST(json_extract(s.data,'$.Quantity') AS INTEGER) END)),MAX(0,CAST(ROUND(SUM(CASE WHEN json_extract(s.data,'$.Movement')='Issued to rep' THEN CAST(json_extract(s.data,'$.Quantity') AS REAL)*COALESCE(CAST(json_extract(s.data,'$."Unit cost"') AS REAL),0)*100 ELSE -CAST(json_extract(s.data,'$.Quantity') AS REAL)*COALESCE(CAST(json_extract(s.data,'$."Unit cost"') AS REAL),0)*100 END)) AS INTEGER)) FROM records s JOIN records p ON p.kind='Products' AND json_extract(p.data,'$.Name')=json_extract(s.data,'$.Product') WHERE s.kind='Samples' AND s.assigned_to<>'' GROUP BY s.assigned_to,p.id;
