CREATE TABLE `countdown_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`chat_id_key` text,
	`topic_id_key` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `variables` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
-- Seed mặc định. Trước đây hai giá trị này là secret TELEGRAM_CHAT_ID / TELEGRAM_TOPIC_ID;
-- nay là dữ liệu admin sửa được. countdown_config trỏ sẵn vào chúng để tính năng chạy
-- được ngay sau migrate, không cần thao tác thủ công.
INSERT INTO `variables` (`key`, `value`) VALUES ('secretary telegram chat id', '-1004353153138');
--> statement-breakpoint
INSERT INTO `variables` (`key`, `value`) VALUES ('secretary daily topic id', '3');
--> statement-breakpoint
INSERT INTO `countdown_config` (`id`, `chat_id_key`, `topic_id_key`) VALUES (1, 'secretary telegram chat id', 'secretary daily topic id');
