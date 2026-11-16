CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`username` text,
	`display_username` text,
	`role` text DEFAULT 'engineer' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`ban_reason` text,
	`ban_expires` integer,
	`must_change_password` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_subject_idx` ON `activity_log` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `breakdown_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`breakdown_id` text NOT NULL,
	`note` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`breakdown_id`) REFERENCES `breakdowns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `breakdown_notes_bd_idx` ON `breakdown_notes` (`breakdown_id`);--> statement-breakpoint
CREATE TABLE `breakdown_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`breakdown_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`paused_at` integer NOT NULL,
	`paused_by` text NOT NULL,
	`resume_on` text,
	`resumed_at` integer,
	`resumed_by` text,
	FOREIGN KEY (`breakdown_id`) REFERENCES `breakdowns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paused_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resumed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `breakdown_pauses_bd_idx` ON `breakdown_pauses` (`breakdown_id`);--> statement-breakpoint
CREATE TABLE `breakdown_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`breakdown_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`email` text NOT NULL,
	`name` text,
	`is_active` integer DEFAULT true NOT NULL,
	`added_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`breakdown_id`) REFERENCES `breakdowns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `breakdown_recipients_bd_idx` ON `breakdown_recipients` (`breakdown_id`);--> statement-breakpoint
CREATE TABLE `breakdowns` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`equipment_id` text NOT NULL,
	`department_id` text NOT NULL,
	`reported_at` integer NOT NULL,
	`reported_by_name` text NOT NULL,
	`problem` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`recorded_by` text NOT NULL,
	`assigned_to` text NOT NULL,
	`provider_id` text,
	`sent_to_provider_at` integer,
	`last_email_on` text,
	`last_email_at` integer,
	`closed_at` integer,
	`closed_by` text,
	`fixed_by` text,
	`service_engineer_name` text,
	`work_done` text,
	`parts_replaced` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `breakdowns_number_unique` ON `breakdowns` (`number`);--> statement-breakpoint
CREATE INDEX `breakdowns_equipment_idx` ON `breakdowns` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `breakdowns_status_idx` ON `breakdowns` (`status`);--> statement-breakpoint
CREATE TABLE `coverage` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`type` text NOT NULL,
	`service_provider_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`pms_every_months` integer,
	`contract_no` text,
	`notes` text,
	`ended_early_on` text,
	`end_processed_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `coverage_equipment_idx` ON `coverage` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`short_name` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_key_unique` ON `departments` (`name_key`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`to_addresses` text NOT NULL,
	`cc_addresses` text,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`resend_id` text,
	`status` text NOT NULL,
	`error` text,
	`related_type` text,
	`related_id` text,
	`provider_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_log_dedupe_key_unique` ON `email_log` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `email_log_related_idx` ON `email_log` (`related_type`,`related_id`);--> statement-breakpoint
CREATE INDEX `email_log_provider_idx` ON `email_log` (`provider_id`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`qr_code` text NOT NULL,
	`model_id` text NOT NULL,
	`serial_number` text NOT NULL,
	`serial_key` text NOT NULL,
	`hospital_tag` text,
	`hospital_tag_key` text,
	`service_provider_id` text NOT NULL,
	`home_department_id` text NOT NULL,
	`current_department_id` text NOT NULL,
	`installed_on` text NOT NULL,
	`status` text DEFAULT 'working' NOT NULL,
	`photo_file_id` text,
	`notes` text,
	`label_outdated` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `equipment_models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_qr_code_unique` ON `equipment` (`qr_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_serial_key_unique` ON `equipment` (`serial_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_hospital_tag_key_unique` ON `equipment` (`hospital_tag_key`);--> statement-breakpoint
CREATE INDEX `equipment_model_idx` ON `equipment` (`model_id`);--> statement-breakpoint
CREATE INDEX `equipment_home_idx` ON `equipment` (`home_department_id`);--> statement-breakpoint
CREATE INDEX `equipment_current_idx` ON `equipment` (`current_department_id`);--> statement-breakpoint
CREATE INDEX `equipment_provider_idx` ON `equipment` (`service_provider_id`);--> statement-breakpoint
CREATE TABLE `equipment_models` (
	`id` text PRIMARY KEY NOT NULL,
	`type_name` text NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`category` text,
	`model_key` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_models_model_key_unique` ON `equipment_models` (`model_key`);--> statement-breakpoint
CREATE TABLE `equipment_service_engineers` (
	`equipment_id` text NOT NULL,
	`service_engineer_id` text NOT NULL,
	`added_by` text,
	`added_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`equipment_id`, `service_engineer_id`),
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_engineer_id`) REFERENCES `service_engineers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`storage_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`removed_at` integer,
	`removed_by` text,
	`purged_at` integer,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`removed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_storage_key_unique` ON `files` (`storage_key`);--> statement-breakpoint
CREATE INDEX `files_owner_idx` ON `files` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `moves` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`from_department_id` text NOT NULL,
	`to_department_id` text NOT NULL,
	`type` text NOT NULL,
	`reason` text NOT NULL,
	`moved_at` integer NOT NULL,
	`moved_by` text NOT NULL,
	`expected_return_on` text,
	`returned_at` integer,
	`returned_by` text,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`returned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `moves_equipment_idx` ON `moves` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `pms_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`coverage_id` text,
	`number` integer,
	`due_on` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`reminder_sent_at` integer,
	`done_on` text,
	`service_engineer_name` text,
	`remarks` text,
	`marked_by` text,
	`from_earlier_records` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coverage_id`) REFERENCES `coverage`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pms_equipment_idx` ON `pms_visits` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `pms_coverage_idx` ON `pms_visits` (`coverage_id`);--> statement-breakpoint
CREATE INDEX `pms_due_idx` ON `pms_visits` (`status`,`due_on`);--> statement-breakpoint
CREATE TABLE `provider_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`label` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `provider_contacts_provider_idx` ON `provider_contacts` (`provider_id`);--> statement-breakpoint
CREATE TABLE `service_engineers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `service_providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_engineers_provider_idx` ON `service_engineers` (`provider_id`);--> statement-breakpoint
CREATE TABLE `service_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`address` text,
	`company_phone` text,
	`company_email` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_providers_name_key_unique` ON `service_providers` (`name_key`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`hospital_name` text NOT NULL,
	`hospital_address` text,
	`department_name` text NOT NULL,
	`department_email` text NOT NULL,
	`department_phone` text NOT NULL,
	`daily_email_time` text DEFAULT '08:00' NOT NULL,
	`pms_reminder_days` integer DEFAULT 3 NOT NULL,
	`email_cc` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
