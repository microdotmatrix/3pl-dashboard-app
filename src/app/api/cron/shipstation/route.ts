import { env } from "@/env";
import { syncAllAccounts } from "@/lib/shipstation/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
};

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;

  if (!constantTimeEqual(authHeader, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await syncAllAccounts();
  const hasError = results.some((result) => result.error !== null);

  return Response.json(
    { ok: !hasError, results },
    { status: hasError ? 207 : 200 },
  );
}
