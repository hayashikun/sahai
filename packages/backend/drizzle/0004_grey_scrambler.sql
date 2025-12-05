CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`executor` text NOT NULL,
	`directory_path` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epics_project_id` ON `epics` (`project_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `epic_id` text REFERENCES epics(id);--> statement-breakpoint
CREATE INDEX `idx_tasks_epic_id` ON `tasks` (`epic_id`);