"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
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
import { requireApprovedUser } from "@/lib/auth/access";

import { noteInputSchema } from "./types";

export const createNote = async (rawInput: unknown) => {
  const ctx = await requireApprovedUser();
  const input = noteInputSchema.parse(rawInput);

  const [note] = await db
    .insert(whiteboardNote)
    .values({
      authorId: ctx.user.id,
      body: input.body,
      pinned: input.pinned,
    })
    .returning();

  if (!note) {
    throw new Error("Failed to create whiteboard note");
  }

  if (input.vendorSlugs.length > 0) {
    const accounts = await db
      .select({ id: shipstationAccount.id })
      .from(shipstationAccount)
      .where(inArray(shipstationAccount.slug, input.vendorSlugs));

    if (accounts.length > 0) {
      await db.insert(whiteboardNoteVendor).values(
        accounts.map((account) => ({
          noteId: note.id,
          accountId: account.id,
        })),
      );
    }
  }

  if (input.shipmentIds.length > 0) {
    const shipments = await db
      .select({ id: shipstationShipment.id })
      .from(shipstationShipment)
      .where(inArray(shipstationShipment.id, input.shipmentIds));

    if (shipments.length > 0) {
      await db.insert(whiteboardNoteShipment).values(
        shipments.map((shipment) => ({
          noteId: note.id,
          shipmentId: shipment.id,
        })),
      );
    }
  }

  revalidatePath("/");

  return { ok: true as const, noteId: note.id };
};

export const togglePinNote = async (noteId: string, pinned: boolean) => {
  await requireApprovedUser();

  await db
    .update(whiteboardNote)
    .set({ pinned, updatedAt: new Date() })
    .where(eq(whiteboardNote.id, noteId));

  revalidatePath("/");
  return { ok: true as const };
};

export const deleteNote = async (noteId: string) => {
  const ctx = await requireApprovedUser();

  const [row] = await db
    .select({ authorId: whiteboardNote.authorId })
    .from(whiteboardNote)
    .where(eq(whiteboardNote.id, noteId))
    .limit(1);

  if (!row) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const isAuthor = row.authorId === ctx.user.id;
  const isAdmin = ctx.user.role === "admin";

  if (!isAuthor && !isAdmin) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  await db.delete(whiteboardNote).where(eq(whiteboardNote.id, noteId));

  revalidatePath("/");
  return { ok: true as const };
};

export const markWhiteboardRead = async () => {
  const ctx = await requireApprovedUser();
  const now = new Date();

  await db
    .insert(whiteboardReadState)
    .values({ userId: ctx.user.id, lastReadAt: now })
    .onConflictDoUpdate({
      target: whiteboardReadState.userId,
      set: { lastReadAt: now },
    });

  return { ok: true as const, lastReadAt: now.toISOString() };
};
