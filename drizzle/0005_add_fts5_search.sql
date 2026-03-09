-- FTS5 virtual table for full-text search on tasks.
-- Covers title, description, solution, and flattened tags.
CREATE VIRTUAL TABLE IF NOT EXISTS `tasks_fts` USING fts5(
	id UNINDEXED,
	title,
	description,
	solution,
	tags
);
--> statement-breakpoint
-- Backfill existing tasks into FTS index.
-- Uses DELETE first to ensure idempotency (no duplicates on re-run).
DELETE FROM `tasks_fts`;
--> statement-breakpoint
INSERT INTO `tasks_fts` (`id`, `title`, `description`, `solution`, `tags`)
SELECT
	`id`,
	`title`,
	COALESCE(`description`, ''),
	COALESCE(`solution`, ''),
	COALESCE(REPLACE(REPLACE(REPLACE(`tags`, '["', ''), '"]', ''), '","', ' '), '')
FROM `tasks`;
--> statement-breakpoint
-- Trigger: insert into FTS on task insert.
CREATE TRIGGER IF NOT EXISTS `trg_tasks_fts_insert`
AFTER INSERT ON `tasks`
BEGIN
	INSERT INTO `tasks_fts` (`id`, `title`, `description`, `solution`, `tags`)
	VALUES (
		NEW.`id`,
		NEW.`title`,
		COALESCE(NEW.`description`, ''),
		COALESCE(NEW.`solution`, ''),
		COALESCE(REPLACE(REPLACE(REPLACE(NEW.`tags`, '["', ''), '"]', ''), '","', ' '), '')
	);
END;
--> statement-breakpoint
-- Trigger: update FTS on task update (delete old row, insert new).
CREATE TRIGGER IF NOT EXISTS `trg_tasks_fts_update`
AFTER UPDATE ON `tasks`
BEGIN
	DELETE FROM `tasks_fts` WHERE `id` = OLD.`id`;
	INSERT INTO `tasks_fts` (`id`, `title`, `description`, `solution`, `tags`)
	VALUES (
		NEW.`id`,
		NEW.`title`,
		COALESCE(NEW.`description`, ''),
		COALESCE(NEW.`solution`, ''),
		COALESCE(REPLACE(REPLACE(REPLACE(NEW.`tags`, '["', ''), '"]', ''), '","', ' '), '')
	);
END;
--> statement-breakpoint
-- Trigger: remove from FTS on task delete.
CREATE TRIGGER IF NOT EXISTS `trg_tasks_fts_delete`
AFTER DELETE ON `tasks`
BEGIN
	DELETE FROM `tasks_fts` WHERE `id` = OLD.`id`;
END;
