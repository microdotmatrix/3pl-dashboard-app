import "server-only";

import { desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import {
  shipstationAccount,
  shipstationShipment,
} from "@/db/schema/shipstation";
import {
  whiteboardNote,
  whiteboardNoteShipment,
  whiteboardNoteVendor,
  whiteboardReadState,
} from "@/db/schema/whiteboard";

import type { NoteDto, NoteShipmentRef, NoteVendorRef } from "./types";

const serializeDate = (value: Date | null): string =>
  value ? value.toISOString() : new Date(0).toISOString();

export const listRecentNotes = async (limit = 50): Promise<NoteDto[]> => {
  const capped = Math.max(1, Math.min(200, limit));

  const noteRows = await db
    .select({
      id: whiteboardNote.id,
      body: whiteboardNote.body,
      pinned: whiteboardNote.pinned,
      createdAt: whiteboardNote.createdAt,
      updatedAt: whiteboardNote.updatedAt,
      author: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    })
    .from(whiteboardNote)
    .innerJoin(user, eq(whiteboardNote.authorId, user.id))
    .orderBy(desc(whiteboardNote.pinned), desc(whiteboardNote.createdAt))
    .limit(capped);

  if (noteRows.length === 0) return [];

  const noteIds = noteRows.map((n) => n.id);

  const vendorRefs = await db
    .select({
      noteId: whiteboardNoteVendor.noteId,
      slug: shipstationAccount.slug,
      displayName: shipstationAccount.displayName,
    })
    .from(whiteboardNoteVendor)
    .innerJoin(
      shipstationAccount,
      eq(whiteboardNoteVendor.accountId, shipstationAccount.id),
    )
    .where(inArray(whiteboardNoteVendor.noteId, noteIds));

  const shipmentRefs = await db
    .select({
      noteId: whiteboardNoteShipment.noteId,
      id: shipstationShipment.id,
      externalId: shipstationShipment.externalId,
      status: shipstationShipment.status,
      recipientName: sql<string | null>`${shipstationShipment.shipTo}->>'name'`,
      recipientCity: sql<
        string | null
      >`${shipstationShipment.shipTo}->>'city_locality'`,
      account: {
        id: shipstationAccount.id,
        slug: shipstationAccount.slug,
        displayName: shipstationAccount.displayName,
      },
    })
    .from(whiteboardNoteShipment)
    .innerJoin(
      shipstationShipment,
      eq(whiteboardNoteShipment.shipmentId, shipstationShipment.id),
    )
    .innerJoin(
      shipstationAccount,
      eq(shipstationShipment.accountId, shipstationAccount.id),
    )
    .where(inArray(whiteboardNoteShipment.noteId, noteIds));

  const vendorByNote = new Map<string, NoteVendorRef[]>();
  for (const row of vendorRefs) {
    const existing = vendorByNote.get(row.noteId) ?? [];
    existing.push({ slug: row.slug, displayName: row.displayName });
    vendorByNote.set(row.noteId, existing);
  }

  const shipmentByNote = new Map<string, NoteShipmentRef[]>();
  for (const row of shipmentRefs) {
    const existing = shipmentByNote.get(row.noteId) ?? [];
    existing.push({
      id: row.id,
      externalId: row.externalId,
      status: row.status,
      recipientName: row.recipientName,
      recipientCity: row.recipientCity,
      account: row.account,
    });
    shipmentByNote.set(row.noteId, existing);
  }

  return noteRows.map((note) => ({
    id: note.id,
    body: note.body,
    pinned: note.pinned,
    createdAt: serializeDate(note.createdAt),
    updatedAt: serializeDate(note.updatedAt),
    author: {
      id: note.author.id,
      name: note.author.name,
      email: note.author.email,
      image: note.author.image,
    },
    vendors: vendorByNote.get(note.id) ?? [],
    shipments: shipmentByNote.get(note.id) ?? [],
  }));
};

export const getUnreadCount = async (userId: string): Promise<number> => {
  const [state] = await db
    .select({ lastReadAt: whiteboardReadState.lastReadAt })
    .from(whiteboardReadState)
    .where(eq(whiteboardReadState.userId, userId))
    .limit(1);

  const since = state?.lastReadAt ?? new Date(0);

  const [{ value }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(whiteboardNote)
    .where(gt(whiteboardNote.createdAt, since));

  return value ?? 0;
};
