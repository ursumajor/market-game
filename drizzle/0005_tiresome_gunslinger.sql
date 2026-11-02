CREATE TABLE `question_invitees` (
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`question_id`, `user_id`),
	FOREIGN KEY (`question_id`) REFERENCES `global_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_invitees_user_idx` ON `question_invitees` (`user_id`);--> statement-breakpoint
ALTER TABLE `global_questions` ADD `audience` text DEFAULT 'EVERYONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `global_questions` ADD `group_id` text REFERENCES groups(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `global_questions_group_idx` ON `global_questions` (`group_id`);