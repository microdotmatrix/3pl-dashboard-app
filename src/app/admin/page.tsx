import { desc, eq, sql } from "drizzle-orm";

import { CopyButton } from "@/components/admin/copy-button";
import { InviteForm } from "@/components/admin/invite-form";
import { RevokeInviteButton } from "@/components/admin/invite-row-actions";
import { ShipstationSyncButton } from "@/components/admin/shipstation-sync-button";
import { UserActionButton } from "@/components/admin/user-row-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { user as userTable } from "@/db/schema/auth";
import { invite } from "@/db/schema/invites";
import { passwordResetLink } from "@/db/schema/password-reset-links";
import { env } from "@/env";
import { requireAdmin } from "@/lib/auth/access";
import { listShipstationSyncStatus } from "@/lib/shipstation/queries";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  status: string;
  banned: boolean | null;
  createdAt: Date;
  approvedAt: Date | null;
};

type InviteRow = typeof invite.$inferSelect & {
  createdByEmail: string | null;
  usedByEmail: string | null;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  rejected: {
    label: "Rejected",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  suspended: {
    label: "Suspended",
    className: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
};

const formatDate = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "—";

const getLatestResetUrls = async () => {
  const rows = await db
    .select({
      userId: passwordResetLink.userId,
      url: passwordResetLink.url,
      createdAt: passwordResetLink.createdAt,
      expiresAt: passwordResetLink.expiresAt,
      email: userTable.email,
    })
    .from(passwordResetLink)
    .leftJoin(userTable, eq(passwordResetLink.userId, userTable.id))
    .orderBy(desc(passwordResetLink.createdAt))
    .limit(50);

  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    latest.push(row);
  }
  return latest;
};

const AdminDashboardPage = async () => {
  const ctx = await requireAdmin();

  const [users, invites, resetLinks, syncStatus] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        status: userTable.status,
        banned: userTable.banned,
        createdAt: userTable.createdAt,
        approvedAt: userTable.approvedAt,
      })
      .from(userTable)
      .orderBy(desc(userTable.createdAt)) as Promise<UserRow[]>,
    db
      .select({
        id: invite.id,
        token: invite.token,
        email: invite.email,
        createdBy: invite.createdBy,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        usedAt: invite.usedAt,
        usedByUserId: invite.usedByUserId,
        revokedAt: invite.revokedAt,
        createdByEmail:
          sql<string>`(SELECT email FROM "user" u WHERE u.id = ${invite.createdBy})`.as(
            "created_by_email",
          ),
        usedByEmail: sql<
          string | null
        >`(SELECT email FROM "user" u WHERE u.id = ${invite.usedByUserId})`.as(
          "used_by_email",
        ),
      })
      .from(invite)
      .orderBy(desc(invite.createdAt)) as Promise<InviteRow[]>,
    getLatestResetUrls(),
    listShipstationSyncStatus(),
  ]);

  const resetByUser = new Map(resetLinks.map((row) => [row.userId, row]));
  const pendingUsers = users.filter((u) => u.status === "pending");

  const inviteBase = env.BETTER_AUTH_URL.replace(/\/$/, "");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>ShipStation sync</CardTitle>
          <CardDescription>
            Last status from <code>shipstation_sync_cursor</code>. The dashboard
            reads shipments from Postgres, so this table must show recent
            successful runs for data to appear.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ShipstationSyncButton />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cursor</TableHead>
                <TableHead>Shipments</TableHead>
                <TableHead>Last error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncStatus.map((row) => {
                const statusLabel = row.lastStatus ?? "never run";
                const statusClass =
                  row.lastStatus === "ok"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : row.lastStatus === "error"
                      ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                      : "bg-slate-500/10 text-slate-700 dark:text-slate-300";
                return (
                  <TableRow key={row.accountId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.displayName}</span>
                        <span className="text-muted-foreground">
                          {row.slug}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(row.lastRunAt)}</TableCell>
                    <TableCell>
                      <Badge className={statusClass}>{statusLabel}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(row.lastModifiedAt)}</TableCell>
                    <TableCell>{row.shipmentCount}</TableCell>
                    <TableCell className="max-w-md">
                      {row.lastError ? (
                        <pre className="whitespace-pre-wrap break-all text-[0.7rem] text-rose-600 dark:text-rose-400">
                          {row.lastError.slice(0, 600)}
                          {row.lastError.length > 600 ? "\u2026" : ""}
                        </pre>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>
            {pendingUsers.length} waiting for review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing to review right now.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-muted-foreground">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <UserActionButton
                          userId={u.id}
                          kind="approve"
                          label="Approve"
                          variant="default"
                        />
                        <UserActionButton
                          userId={u.id}
                          kind="reject"
                          label="Reject"
                          variant="destructive"
                          confirm="Reject this user? They will not be able to sign in."
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            Approve, suspend, and manage admin privileges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Latest reset URL</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === ctx.user.id;
                const statusInfo =
                  STATUS_BADGE[u.status] ?? STATUS_BADGE.pending;
                const reset = resetByUser.get(u.id);
                const resetExpired = reset?.expiresAt
                  ? reset.expiresAt.getTime() < Date.now()
                  : false;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {u.name}
                          {isSelf ? (
                            <span className="ml-2 text-[0.65rem] text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusInfo.className}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                      >
                        {u.role === "admin" ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {reset ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[0.7rem] text-muted-foreground">
                            {formatDate(reset.createdAt)}
                            {resetExpired ? " · expired" : ""}
                          </span>
                          <CopyButton
                            value={reset.url}
                            label="Copy reset URL"
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {u.status === "pending" ? (
                          <UserActionButton
                            userId={u.id}
                            kind="approve"
                            label="Approve"
                            variant="default"
                            disabled={isSelf}
                          />
                        ) : null}
                        {u.status === "approved" ? (
                          <UserActionButton
                            userId={u.id}
                            kind="suspend"
                            label="Suspend"
                            variant="destructive"
                            confirm="Suspend this user? Their active sessions will be revoked."
                            disabled={isSelf}
                          />
                        ) : null}
                        {u.status === "suspended" || u.status === "rejected" ? (
                          <UserActionButton
                            userId={u.id}
                            kind="reactivate"
                            label="Reactivate"
                            variant="default"
                            disabled={isSelf}
                          />
                        ) : null}
                        {u.role === "admin" ? (
                          <UserActionButton
                            userId={u.id}
                            kind="demote"
                            label="Demote"
                            variant="outline"
                            confirm="Remove admin privileges?"
                            disabled={isSelf}
                          />
                        ) : (
                          <UserActionButton
                            userId={u.id}
                            kind="promote"
                            label="Make admin"
                            variant="outline"
                            confirm="Promote this user to admin?"
                            disabled={isSelf || u.status !== "approved"}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite links</CardTitle>
          <CardDescription>
            Generate pre-approved invite links. Users signing up with a valid
            invite are approved immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <InviteForm />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No invites yet.
                  </TableCell>
                </TableRow>
              ) : (
                invites.map((inv) => {
                  const expired = inv.expiresAt.getTime() < Date.now();
                  const status = inv.usedAt
                    ? "used"
                    : inv.revokedAt
                      ? "revoked"
                      : expired
                        ? "expired"
                        : "active";
                  const url = `${inviteBase || ""}/sign-up?invite=${encodeURIComponent(inv.token)}`;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email ?? "any"}</TableCell>
                      <TableCell>{formatDate(inv.createdAt)}</TableCell>
                      <TableCell>{formatDate(inv.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "active" ? "default" : "secondary"
                          }
                        >
                          {status}
                        </Badge>
                        {inv.usedByEmail ? (
                          <span className="ml-2 text-[0.7rem] text-muted-foreground">
                            by {inv.usedByEmail}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {status === "active" ? (
                          <CopyButton value={url} label="Copy" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {status === "active" ? (
                          <RevokeInviteButton inviteId={inv.id} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboardPage;
