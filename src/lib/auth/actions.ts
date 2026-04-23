"use server";

import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { resolveRedirectForProfile } from "@/lib/auth/access";
import { findUsableInvite, markInviteUsed } from "@/lib/auth/invites";
import type { AuthActionState } from "@/lib/auth/state";

const getString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const isNonEmpty = (value: string) => value.length > 0;

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isSafeRedirect = (target: string | null | undefined): target is string =>
  Boolean(target?.startsWith("/") && !target.startsWith("//"));

const toActionError = (error: unknown): AuthActionState => {
  if (error instanceof APIError) {
    return { status: "error", message: error.message };
  }
  if (error instanceof Error) {
    return { status: "error", message: error.message };
  }
  return {
    status: "error",
    message: "Something went wrong. Please try again.",
  };
};

const loadProfile = async (userId: string) => {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      status: user.status,
      approvedAt: user.approvedAt,
      approvedBy: user.approvedBy,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0] ?? null;
};

const finalizeUserAfterSignUp = async (userId: string, inviteToken: string) => {
  const adminEmailRaw = env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const created = await loadProfile(userId);
  if (!created) return null;

  let role = created.role ?? "user";
  let status = created.status ?? "pending";
  let approvedAt: Date | null = created.approvedAt;
  let approvedBy: string | null = created.approvedBy;

  if (adminEmailRaw && created.email.toLowerCase() === adminEmailRaw) {
    role = "admin";
    status = "approved";
    approvedAt = new Date();
    approvedBy = created.id; // self-approved bootstrap admin
  } else if (inviteToken) {
    const invite = await findUsableInvite(inviteToken);
    if (invite) {
      status = "approved";
      approvedAt = new Date();
      approvedBy = invite.createdBy;
      await markInviteUsed(invite.id, created.id);
    }
  }

  if (
    role !== created.role ||
    status !== created.status ||
    approvedAt !== created.approvedAt ||
    approvedBy !== created.approvedBy
  ) {
    await db
      .update(user)
      .set({ role, status, approvedAt, approvedBy, updatedAt: new Date() })
      .where(eq(user.id, created.id));
  }

  return {
    ...created,
    role,
    status,
    approvedAt,
    approvedBy,
  };
};

export const signUpAction = async (
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> => {
  const name = getString(formData, "name");
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const confirmPassword = getString(formData, "confirmPassword");
  const inviteToken = getString(formData, "invite");
  const redirectTo = getString(formData, "redirect");

  const fieldErrors: Record<string, string> = {};
  if (!isNonEmpty(name)) fieldErrors.name = "Name is required.";
  if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters.";
  }
  if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  let createdUserId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
    createdUserId = result?.user?.id;
  } catch (error) {
    return toActionError(error);
  }

  if (!createdUserId) {
    return {
      status: "error",
      message: "Account could not be created. Please try again.",
    };
  }

  const finalProfile = await finalizeUserAfterSignUp(
    createdUserId,
    inviteToken,
  );
  const destination = finalProfile
    ? resolveRedirectForProfile({
        id: finalProfile.id,
        name: finalProfile.name,
        email: finalProfile.email,
        image: finalProfile.image,
        role: (finalProfile.role ?? "user") as "admin" | "user",
        status: (finalProfile.status ?? "pending") as
          | "pending"
          | "approved"
          | "rejected"
          | "suspended",
        approvedAt: finalProfile.approvedAt,
        approvedBy: finalProfile.approvedBy,
        banned: Boolean(finalProfile.banned),
        banReason: finalProfile.banReason,
        banExpires: finalProfile.banExpires,
      })
    : "/pending-approval";

  if (destination === "/" && isSafeRedirect(redirectTo)) {
    redirect(redirectTo);
  }
  redirect(destination);
};

export const signInAction = async (
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> => {
  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const redirectTo = getString(formData, "redirect");

  const fieldErrors: Record<string, string> = {};
  if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!isNonEmpty(password)) fieldErrors.password = "Password is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  let signedInUserId: string | undefined;
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    signedInUserId = result?.user?.id;
  } catch (error) {
    return toActionError(error);
  }

  if (!signedInUserId) {
    redirect("/sign-in");
  }

  const profile = await loadProfile(signedInUserId);
  const destination = profile
    ? resolveRedirectForProfile({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.image,
        role: (profile.role ?? "user") as "admin" | "user",
        status: (profile.status ?? "pending") as
          | "pending"
          | "approved"
          | "rejected"
          | "suspended",
        approvedAt: profile.approvedAt,
        approvedBy: profile.approvedBy,
        banned: Boolean(profile.banned),
        banReason: profile.banReason,
        banExpires: profile.banExpires,
      })
    : "/pending-approval";

  if (destination === "/" && isSafeRedirect(redirectTo)) {
    redirect(redirectTo);
  }
  redirect(destination);
};

export const signOutAction = async (): Promise<void> => {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
};

export const forgotPasswordAction = async (
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> => {
  const email = getString(formData, "email");

  if (!isValidEmail(email)) {
    return {
      status: "error",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
  } catch (error) {
    // Intentionally do not leak existence of the account.
    console.error("[auth] requestPasswordReset error", error);
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, we've generated a reset link. Check with your administrator to retrieve it.",
  };
};

export const resetPasswordAction = async (
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> => {
  const token = getString(formData, "token");
  const password = getString(formData, "password");
  const confirmPassword = getString(formData, "confirmPassword");

  const fieldErrors: Record<string, string> = {};
  if (!isNonEmpty(token)) {
    return {
      status: "error",
      message: "Reset token is missing or invalid.",
    };
  }
  if (password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters.";
  }
  if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch (error) {
    return toActionError(error);
  }

  redirect("/sign-in?reason=reset");
};
