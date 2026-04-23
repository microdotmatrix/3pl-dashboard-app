import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { auth } from "@/lib/auth";

export type UserStatus = "pending" | "approved" | "rejected" | "suspended";
export type UserRole = "admin" | "user";

export type SessionProfile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  status: UserStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
};

export type SessionContext = {
  session: NonNullable<
    Awaited<ReturnType<typeof auth.api.getSession>>
  >["session"];
  user: SessionProfile;
} | null;

const normalizeRole = (value: string | null | undefined): UserRole =>
  value === "admin" ? "admin" : "user";

const normalizeStatus = (value: string | null | undefined): UserStatus => {
  if (value === "approved" || value === "rejected" || value === "suspended") {
    return value;
  }
  return "pending";
};

export const getSessionWithProfile = cache(
  async (): Promise<SessionContext> => {
    const raw = await auth.api.getSession({ headers: await headers() });
    if (!raw?.session || !raw.user) return null;

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
      .where(eq(user.id, raw.user.id))
      .limit(1);

    const profile = rows[0];
    if (!profile) return null;

    return {
      session: raw.session,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.image,
        role: normalizeRole(profile.role),
        status: normalizeStatus(profile.status),
        approvedAt: profile.approvedAt,
        approvedBy: profile.approvedBy,
        banned: Boolean(profile.banned),
        banReason: profile.banReason,
        banExpires: profile.banExpires,
      },
    };
  },
);

export const requireApprovedUser = async (): Promise<
  NonNullable<SessionContext>
> => {
  const ctx = await getSessionWithProfile();
  if (!ctx) redirect("/sign-in");
  if (ctx.user.banned || ctx.user.status === "suspended") {
    redirect("/sign-in?reason=suspended");
  }
  if (ctx.user.status !== "approved") {
    redirect("/pending-approval");
  }
  return ctx;
};

export const requireAdmin = async (): Promise<NonNullable<SessionContext>> => {
  const ctx = await requireApprovedUser();
  if (ctx.user.role !== "admin") {
    notFound();
  }
  return ctx;
};

export const resolveRedirectForProfile = (profile: SessionProfile): string => {
  if (profile.banned || profile.status === "suspended") {
    return "/sign-in?reason=suspended";
  }
  if (profile.status === "rejected") {
    return "/sign-in?reason=rejected";
  }
  if (profile.status !== "approved") {
    return "/pending-approval";
  }
  return "/";
};
