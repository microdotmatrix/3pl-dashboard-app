"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { db } from "@/db";
import { session, user } from "@/db/schema/auth";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/access";
import { createInviteRecord, revokeInviteRecord } from "@/lib/auth/invites";

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  inviteUrl?: string;
};

export const INITIAL_ADMIN_ACTION_STATE: AdminActionState = { status: "idle" };

const getString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const revalidateAdmin = () => {
  revalidatePath("/admin");
};

const revokeAllSessions = async (userId: string) => {
  await db.delete(session).where(eq(session.userId, userId));
};

const assertSelfBlocked = (targetUserId: string, adminId: string) => {
  if (targetUserId === adminId) {
    throw new Error("You cannot perform this action on your own account.");
  }
};

export const approveUserAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  const ctx = await requireAdmin();
  const targetId = getString(formData, "userId");
  if (!targetId) {
    return { status: "error", message: "Missing user id." };
  }
  assertSelfBlocked(targetId, ctx.user.id);

  await db
    .update(user)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(user.id, targetId));

  revalidateAdmin();
  return { status: "success", message: "User approved." };
};

export const rejectUserAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  const ctx = await requireAdmin();
  const targetId = getString(formData, "userId");
  if (!targetId) {
    return { status: "error", message: "Missing user id." };
  }
  assertSelfBlocked(targetId, ctx.user.id);

  await db
    .update(user)
    .set({
      status: "rejected",
      approvedAt: null,
      approvedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, targetId));

  await revokeAllSessions(targetId);
  revalidateAdmin();
  return { status: "success", message: "User rejected." };
};

export const suspendUserAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  const ctx = await requireAdmin();
  const targetId = getString(formData, "userId");
  if (!targetId) {
    return { status: "error", message: "Missing user id." };
  }
  assertSelfBlocked(targetId, ctx.user.id);

  await db
    .update(user)
    .set({
      status: "suspended",
      banned: true,
      banReason: getString(formData, "reason") || null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, targetId));

  await revokeAllSessions(targetId);
  revalidateAdmin();
  return { status: "success", message: "User suspended." };
};

export const reactivateUserAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  const ctx = await requireAdmin();
  const targetId = getString(formData, "userId");
  if (!targetId) {
    return { status: "error", message: "Missing user id." };
  }
  assertSelfBlocked(targetId, ctx.user.id);

  await db
    .update(user)
    .set({
      status: "approved",
      banned: false,
      banReason: null,
      banExpires: null,
      approvedAt: new Date(),
      approvedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(user.id, targetId));

  revalidateAdmin();
  return { status: "success", message: "User reactivated." };
};

export const setRoleAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  const ctx = await requireAdmin();
  const targetId = getString(formData, "userId");
  const role = getString(formData, "role");
  if (!targetId) {
    return { status: "error", message: "Missing user id." };
  }
  if (role !== "admin" && role !== "user") {
    return { status: "error", message: "Invalid role." };
  }
  assertSelfBlocked(targetId, ctx.user.id);

  await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.id, targetId));

  revalidateAdmin();
  return {
    status: "success",
    message: role === "admin" ? "User promoted to admin." : "Admin demoted.",
  };
};

const getBaseUrl = async () => {
  if (env.BETTER_AUTH_URL) {
    return env.BETTER_AUTH_URL.replace(/\/$/, "");
  }
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
};

export const createInviteAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  const ctx = await requireAdmin();
  const email = getString(formData, "email");

  if (email && !isValidEmail(email)) {
    return {
      status: "error",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }

  const record = await createInviteRecord({
    createdBy: ctx.user.id,
    email: email || undefined,
  });

  const baseUrl = await getBaseUrl();
  const inviteUrl = `${baseUrl}/sign-up?invite=${encodeURIComponent(record.token)}`;

  revalidateAdmin();
  return {
    status: "success",
    message: "Invite link created.",
    inviteUrl,
  };
};

export const revokeInviteAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  await requireAdmin();
  const inviteId = getString(formData, "inviteId");
  if (!inviteId) {
    return { status: "error", message: "Missing invite id." };
  }
  await revokeInviteRecord(inviteId);
  revalidateAdmin();
  return { status: "success", message: "Invite revoked." };
};

// Expose the admin-plugin impersonation API through a server action wrapper
// in case future screens want it; not used by the default UI below.
export const adminRevokeSessionsAction = async (
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> => {
  await requireAdmin();
  const targetId = getString(formData, "userId");
  if (!targetId) {
    return { status: "error", message: "Missing user id." };
  }
  try {
    await auth.api.revokeUserSessions({
      body: { userId: targetId },
      headers: await headers(),
    });
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Failed to revoke sessions.",
    };
  }
  revalidateAdmin();
  return { status: "success", message: "Sessions revoked." };
};
