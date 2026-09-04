CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`message` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_signature_unique` ON `chat_messages` (`signature`);
--> statement-breakpoint
CREATE INDEX `chat_messages_created_at_idx` ON `chat_messages` (`created_at`);
