-- Migrate existing "plan" source values to "opencode-plan"
-- The "opencode" and "opencode-plan" sources replace the old "plan" source.
-- "opencode" = tasks created directly by OpenCode
-- "opencode-plan" = tasks created from OpenCode plan files
UPDATE `tasks` SET `source` = 'opencode-plan' WHERE `source` = 'plan';
