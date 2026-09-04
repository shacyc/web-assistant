CREATE TABLE `healthcheck_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`chat_id_key` text,
	`topic_id_key` text,
	`template` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `healthcheck_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`check_script` text,
	`last_state` text,
	`last_state_at` integer,
	`last_checked_at` integer,
	`last_detail` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `healthcheck_enabled_idx` ON `healthcheck_targets` (`enabled`);
--> statement-breakpoint
-- Seed sẵn một dòng lịch cho healthcheck.run (mỗi 5 phút, khớp nhịp cron thật) nhưng
-- TẮT: admin bật ở /admin/schedules sau khi đã thêm URL + cấu hình đích gửi Telegram.
-- id cố định để migrate chạy lại không đẻ dòng trùng.
INSERT INTO `schedules` (`id`, `action_id`, `payload`, `kind`, `time_of_day`, `cron`, `enabled`) VALUES ('seed-healthcheck-cron', 'healthcheck.run', '{}', 'cron', '00:00', '*/5 * * * *', 0);