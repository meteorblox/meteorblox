import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const walletProfiles = sqliteTable("wallet_profiles", {
  address: text("address").primaryKey(),
  username: text("username").notNull().unique(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull(),
  message: text("message").notNull(),
  signature: text("signature").notNull().unique(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("chat_messages_created_at_idx").on(table.createdAt)]);
