import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const invite = pgTable("invite", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: text("used_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
