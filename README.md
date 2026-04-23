# 3PL Dashboard

Next.js 16 + React 19 app with Better Auth, Drizzle ORM, and Neon Postgres.

## Getting Started

```bash
pnpm install
cp .env.example .env
# fill in DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, ADMIN_EMAIL
pnpm db:push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication & Access Control

Email + password authentication is powered by [Better Auth](https://better-auth.com). New sign-ups land in `status='pending'` and cannot access the dashboard until an admin approves them.

### Environment variables

| Variable             | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Neon Postgres connection string                                                  |
| `BETTER_AUTH_SECRET` | Signing secret (min 32 chars). Generate with `openssl rand -base64 32`           |
| `BETTER_AUTH_URL`    | Public base URL (used for invite links and reset URLs)                           |
| `ADMIN_EMAIL`        | Email that gets auto-promoted to `role='admin'` + `status='approved'` on sign-up |

### Bootstrapping the first admin

1. Set `ADMIN_EMAIL=you@example.com` in `.env`.
2. Visit `/sign-up` and register with that exact email.
3. You will be signed in and land on `/` with admin access. Use `/admin` to manage other users.

### Invite links

From `/admin` an administrator can mint invite links. Users who sign up via `/sign-up?invite=<token>` are approved immediately. Invites can bind a specific email (locking the sign-up form) or stay open.

### Forgot / reset password (stubbed email delivery)

`/forgot-password` triggers Better Auth's `requestPasswordReset`. In this stubbed setup the reset URL is:

- logged to the server console as `[auth] URL: ...`
- persisted in the `password_reset_link` table

The current reset URL for any user is also surfaced in `/admin` with a copy button. Replace the `sendResetPassword` handler in `src/lib/auth/index.ts` with an email provider (e.g. Resend) when you're ready to deliver links directly.

### Key files

- `src/lib/auth/index.ts` – Better Auth config (admin plugin, additional fields, reset-password stub)
- `src/lib/auth/actions.ts` – server actions: sign in/up, forgot/reset, sign out
- `src/lib/auth/access.ts` – `requireApprovedUser`, `requireAdmin`, `getSessionWithProfile`
- `src/lib/admin/actions.ts` – approve / reject / suspend / role / invite management
- `src/proxy.ts` – Next.js 16 proxy (edge middleware) for cookie-presence routing
- `src/app/(auth)/` – sign-in, sign-up, forgot-password, reset-password pages
- `src/app/pending-approval/` – awaiting-approval landing page
- `src/app/admin/` – user access control panel

## Database

- `pnpm db:generate` – emit a new migration from the Drizzle schema
- `pnpm db:push` – sync the schema directly (recommended for Neon dev branches)
- `pnpm db:studio` – open Drizzle Studio
