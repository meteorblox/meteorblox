CREATE TABLE `wallet_profiles` (
	`address` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_profiles_username_unique` ON `wallet_profiles` (`username`);
