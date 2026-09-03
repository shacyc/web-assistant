CREATE TABLE `countdown_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`description` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `countdown_active_idx` ON `countdown_events` (`enabled`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `logs_created_idx` ON `execution_logs` (`created_at`);