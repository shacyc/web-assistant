CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`time_of_day` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_date` text,
	`last_run_at` integer,
	`last_run_status` text,
	`last_run_detail` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `schedules_due_idx` ON `schedules` (`enabled`,`time_of_day`);