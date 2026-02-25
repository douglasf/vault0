CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`version_info` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_releases_board` ON `releases` (`board_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `type` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `release_id` text REFERENCES releases(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `solution` text;--> statement-breakpoint
CREATE INDEX `idx_tasks_release` ON `tasks` (`release_id`);