CREATE TABLE `friendships` (
	`requester_id` text NOT NULL,
	`addressee_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`requester_id`, `addressee_id`),
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addressee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `friendships_addressee_idx` ON `friendships` (`addressee_id`);--> statement-breakpoint
CREATE TABLE `market_approvals` (
	`market_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	PRIMARY KEY(`market_id`, `user_id`),
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `market_approvals_user_idx` ON `market_approvals` (`user_id`);--> statement-breakpoint
-- Hand-written: existing users need a username, so rebuild the table and derive
-- one from the email's local part (sanitized; duplicates get an id suffix).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
WITH base AS (
	SELECT *, rowid AS rid,
		lower(replace(replace(replace(substr(email, 1, instr(email, '@') - 1), '.', '_'), '+', '_'), '-', '_')) AS raw
	FROM `users`
), clean AS (
	SELECT *, CASE WHEN length(raw) >= 3 AND raw NOT GLOB '*[^a-z0-9_]*' THEN substr(raw, 1, 15) ELSE 'user' END AS b
	FROM base
), numbered AS (
	SELECT *, row_number() OVER (PARTITION BY b ORDER BY rid) AS rn FROM clean
)
INSERT INTO `__new_users`("id", "email", "username", "name", "password_hash", "created_at")
SELECT "id", "email", CASE WHEN rn = 1 THEN b ELSE b || '_' || substr(id, 1, 4) END, "name", "password_hash", "created_at"
FROM numbered;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);