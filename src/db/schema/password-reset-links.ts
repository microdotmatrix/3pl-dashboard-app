import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const passwordResetLink = pgTable("password_reset_link", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});
