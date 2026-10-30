PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_markets` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`created_by_id` text NOT NULL,
	`question` text NOT NULL,
	`unit` text,
	`maker_id` text NOT NULL,
	`low` real NOT NULL,
	`high` real NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`true_value` real,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`maker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_markets`("id", "group_id", "created_by_id", "question", "unit", "maker_id", "low", "high", "status", "true_value", "resolved_at", "created_at") SELECT "id", "group_id", "created_by_id", "question", "unit", "maker_id", "low", "high", "status", "true_value", "resolved_at", "created_at" FROM `markets`;--> statement-breakpoint
DROP TABLE `markets`;--> statement-breakpoint
ALTER TABLE `__new_markets` RENAME TO `markets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `markets_group_idx` ON `markets` (`group_id`);--> statement-breakpoint
CREATE TABLE `__new_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`group_id` text,
	`maker_id` text NOT NULL,
	`taker_id` text NOT NULL,
	`raw` real NOT NULL,
	`points` real NOT NULL,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transfers`("id", "market_id", "group_id", "maker_id", "taker_id", "raw", "points") SELECT "id", "market_id", "group_id", "maker_id", "taker_id", "raw", "points" FROM `transfers`;--> statement-breakpoint
DROP TABLE `transfers`;--> statement-breakpoint
ALTER TABLE `__new_transfers` RENAME TO `transfers`;--> statement-breakpoint
CREATE INDEX `transfers_group_idx` ON `transfers` (`group_id`);--> statement-breakpoint
CREATE INDEX `transfers_market_idx` ON `transfers` (`market_id`);