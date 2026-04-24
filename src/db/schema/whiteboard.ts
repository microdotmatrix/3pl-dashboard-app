import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { shipstationAccount, shipstationShipment } from "./shipstation";

export const whiteboardNote = pgTable(
  "whiteboard_note",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whiteboard_note_pinned_created_idx").on(t.pinned, t.createdAt),
    index("whiteboard_note_created_idx").on(t.createdAt),
  ],
);

export const whiteboardNoteShipment = pgTable(
  "whiteboard_note_shipment",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => whiteboardNote.id, { onDelete: "cascade" }),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipstationShipment.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.shipmentId] }),
    index("whiteboard_note_shipment_shipment_idx").on(t.shipmentId),
  ],
);

export const whiteboardNoteVendor = pgTable(
  "whiteboard_note_vendor",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => whiteboardNote.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => shipstationAccount.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.accountId] }),
    index("whiteboard_note_vendor_account_idx").on(t.accountId),
  ],
);

export const whiteboardReadState = pgTable("whiteboard_read_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const whiteboardNoteRelations = relations(
  whiteboardNote,
  ({ one, many }) => ({
    author: one(user, {
      fields: [whiteboardNote.authorId],
      references: [user.id],
    }),
    shipments: many(whiteboardNoteShipment),
    vendors: many(whiteboardNoteVendor),
  }),
);

export const whiteboardNoteShipmentRelations = relations(
  whiteboardNoteShipment,
  ({ one }) => ({
    note: one(whiteboardNote, {
      fields: [whiteboardNoteShipment.noteId],
      references: [whiteboardNote.id],
    }),
    shipment: one(shipstationShipment, {
      fields: [whiteboardNoteShipment.shipmentId],
      references: [shipstationShipment.id],
    }),
  }),
);

export const whiteboardNoteVendorRelations = relations(
  whiteboardNoteVendor,
  ({ one }) => ({
    note: one(whiteboardNote, {
      fields: [whiteboardNoteVendor.noteId],
      references: [whiteboardNote.id],
    }),
    account: one(shipstationAccount, {
      fields: [whiteboardNoteVendor.accountId],
      references: [shipstationAccount.id],
    }),
  }),
);

export const whiteboardReadStateRelations = relations(
  whiteboardReadState,
  ({ one }) => ({
    user: one(user, {
      fields: [whiteboardReadState.userId],
      references: [user.id],
    }),
  }),
);

export type WhiteboardNote = typeof whiteboardNote.$inferSelect;
export type WhiteboardNoteInsert = typeof whiteboardNote.$inferInsert;
export type WhiteboardReadState = typeof whiteboardReadState.$inferSelect;
