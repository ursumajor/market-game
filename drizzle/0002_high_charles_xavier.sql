-- Hand-written: SQLite can't DROP COLUMN on a column with a foreign key, so rebuild the table.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`maker_id` text NOT NULL,
	`taker_id` text NOT NULL,
	`raw` real NOT NULL,
	`points` real NOT NULL,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`taker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transfers`("id", "market_id", "maker_id", "taker_id", "raw", "points") SELECT "id", "market_id", "maker_id", "taker_id", "raw", "points" FROM `transfers`;--> statement-breakpoint
DROP TABLE `transfers`;--> statement-breakpoint
ALTER TABLE `__new_transfers` RENAME TO `transfers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transfers_market_idx` ON `transfers` (`market_id`);--> statement-breakpoint
CREATE INDEX `transfers_maker_idx` ON `transfers` (`maker_id`);--> statement-breakpoint
CREATE INDEX `transfers_taker_idx` ON `transfers` (`taker_id`);
