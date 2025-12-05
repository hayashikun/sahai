CREATE TABLE `epic_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text NOT NULL,
	`content` text NOT NULL,
	`log_type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epic_logs_epic_id` ON `epic_logs` (`epic_id`);