import { type NextRequest, NextResponse } from "next/server";

import { requireApprovedUser } from "@/lib/auth/access";
import { searchShipmentsForPicker } from "@/lib/shipstation/queries";

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest) => {
  await requireApprovedUser();

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 15;

  const results = await searchShipmentsForPicker(query, limit);

  console.log("results", results);

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "no-store" } },
  );
};
