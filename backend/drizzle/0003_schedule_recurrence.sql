ALTER TABLE `schedules` ADD `kind` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `schedules` ADD `days_of_week` text;--> statement-breakpoint
ALTER TABLE `schedules` ADD `day_of_month` integer;--> statement-breakpoint
ALTER TABLE `schedules` ADD `interval_days` integer;--> statement-breakpoint
ALTER TABLE `schedules` ADD `anchor_date` text;--> statement-breakpoint
ALTER TABLE `schedules` ADD `cron` text;--> statement-breakpoint
ALTER TABLE `schedules` ADD `last_run_slot` text;