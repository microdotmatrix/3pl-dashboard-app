import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { invite } from "@/db/schema/invites";

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const INVITE_TOKEN_BYTES = 32;

export const generateInviteToken = () =>
  randomBytes(INVITE_TOKEN_BYTES).toString("base64url");

export type InviteRecord = typeof invite.$inferSelect;

export const findUsableInvite = async (
  token: string,
): Promise<InviteRecord | null> => {
  if (!token) return null;
  const now = new Date();
  const rows = await db
    .select()
    .from(invite)
    .where(
      and(
        eq(invite.token, token),
        isNull(invite.usedAt),
        isNull(invite.revokedAt),
        gt(invite.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const markInviteUsed = async (inviteId: string, userId: string) => {
  await db
    .update(invite)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(and(eq(invite.id, inviteId), isNull(invite.usedAt)));
};

export const createInviteRecord = async (args: {
  createdBy: string;
  email?: string;
  ttlMs?: number;
}): Promise<InviteRecord> => {
  const token = generateInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (args.ttlMs ?? INVITE_TTL_MS));
  const [row] = await db
    .insert(invite)
    .values({
      id: randomUUID(),
      token,
      email: args.email?.trim().toLowerCase() || null,
      createdBy: args.createdBy,
      createdAt: now,
      expiresAt,
    })
    .returning();
  return row;
};

export const revokeInviteRecord = async (inviteId: string) => {
  await db
    .update(invite)
    .set({ revokedAt: new Date() })
    .where(and(eq(invite.id, inviteId), isNull(invite.usedAt)));
};

export const listInviteRecords = async () => {
  return db.select().from(invite).orderBy(desc(invite.createdAt));
};

export const buildInviteUrl = (token: string, baseURL: string) => {
  const trimmed = baseURL.replace(/\/$/, "");
  return `${trimmed}/sign-up?invite=${encodeURIComponent(token)}`;
};
