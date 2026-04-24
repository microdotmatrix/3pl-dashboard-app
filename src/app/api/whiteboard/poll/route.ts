import { NextResponse } from "next/server";

import { requireApprovedUser } from "@/lib/auth/access";
import { getUnreadCount, listRecentNotes } from "@/lib/whiteboard/queries";
import type { WhiteboardPollResponse } from "@/lib/whiteboard/types";

export const dynamic = "force-dynamic";

export const GET = async () => {
  const ctx = await requireApprovedUser();

  const [notes, unreadCount] = await Promise.all([
    listRecentNotes(50),
    getUnreadCount(ctx.user.id),
  ]);

  const payload: WhiteboardPollResponse = {
    notes,
    unreadCount,
    serverTime: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
};
