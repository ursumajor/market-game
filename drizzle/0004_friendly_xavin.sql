CREATE TABLE `global_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by_id` text NOT NULL,
	`question` text NOT NULL,
	`unit` text,
	`answer_source` text NOT NULL,
	`closes_at` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`true_value` real,
	`dispute_ends_at` integer,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `global_questions_closes_idx` ON `global_questions` (`closes_at`);--> statement-breakpoint
CREATE TABLE `question_disputes` (
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`question_id`, `user_id`),
	FOREIGN KEY (`question_id`) REFERENCES `global_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `markets` ADD `question_id` text REFERENCES global_questions(id);--> statement-breakpoint
ALTER TABLE `markets` ADD `accepting_trades` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `markets` ADD `max_trades` integer;--> statement-breakpoint
CREATE INDEX `markets_question_idx` ON `markets` (`question_id`);