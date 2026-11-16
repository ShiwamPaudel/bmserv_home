CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_sent_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `coverage` ADD `pms_every` integer;--> statement-breakpoint
ALTER TABLE `coverage` ADD `pms_unit` text DEFAULT 'months' NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment_models` ADD `pms_every` integer;--> statement-breakpoint
ALTER TABLE `equipment_models` ADD `pms_unit` text DEFAULT 'months' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `country_code` text DEFAULT '+977' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `email_team_on_report` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `pms_soon_days` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `coverage_warn_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `paused_warn_days` integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `staff_reports` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `staff_report_assignee_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `push_on_breakdown` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `push_on_fixed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `whatsapp_buttons` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `coverage` SET `pms_every` = `pms_every_months` WHERE `pms_every_months` IS NOT NULL;