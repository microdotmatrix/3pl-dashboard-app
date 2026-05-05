import { requireAdmin } from "@/lib/auth/access";
import { exportMonthlyBillingReportCsv } from "@/lib/billing/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) => {
  await requireAdmin();

  const { reportId } = await params;

  try {
    const { csv, fileName } = await exportMonthlyBillingReportCsv({ reportId });

    return new Response(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export CSV.";
    const status = message.includes("not found") ? 404 : 400;

    return new Response(message, { status });
  }
};
