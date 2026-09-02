import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const walletProfiles = sqliteTable("wallet_profiles", {
  address: text("address").primaryKey(),
  username: text("username").notNull().unique(),
  updatedAt: integer("updated_at").notNull(),
});
