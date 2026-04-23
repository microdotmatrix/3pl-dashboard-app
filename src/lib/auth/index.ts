import { randomUUID } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";

import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema/auth";
import { passwordResetLink } from "@/db/schema/password-reset-links";
import { env } from "@/env";

const getBaseUrl = () => env.BETTER_AUTH_URL.replace(/\/$/, "");

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user: resetUser, url, token }) => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h
      try {
        await db.insert(passwordResetLink).values({
          id: randomUUID(),
          userId: resetUser.id,
          url,
          token,
          createdAt: new Date(),
          expiresAt,
        });
      } catch (error) {
        console.error("[auth] failed to persist password reset link", error);
      }

      // Stubbed email delivery: surface the URL so an admin can forward it.
      console.info(
        `\n[auth] Password reset requested for ${resetUser.email}\n[auth] URL: ${url}\n`,
      );
    },
  },
  user: {
    additionalFields: {
      status: {
        type: "string",
        input: false,
        required: false,
        defaultValue: "pending",
      },
      approvedAt: {
        type: "date",
        input: false,
        required: false,
      },
      approvedBy: {
        type: "string",
        input: false,
        required: false,
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = typeof auth.$Infer.Session.user;
