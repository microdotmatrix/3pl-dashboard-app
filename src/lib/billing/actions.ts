"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/access";

import {
  finalizeMonthlyBillingReport,
  generateMonthlyBillingReport,
} from "./reports";

export type MonthlyBillingActionResult = {
  ok: boolean;
  message: string;
  reportId?: string;
};

const revalidateBillingPages = () => {
  revalidatePath("/admin/reports/monthly");
};

export const generateMonthlyBillingReportAction = async ({
  accountSlug,
  year,
  month,
}: {
  accountSlug: string;
  year: number;
  month: number;
}): Promise<MonthlyBillingActionResult> => {
  await requireAdmin();

  try {
    const report = await generateMonthlyBillingReport({
      accountSlug,
      year,
      month,
    });

    revalidateBillingPages();
    return {
      ok: true,
      message: `Draft report generated for ${report.report.account.displayName}.`,
      reportId: report.report.id,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate the monthly billing report.",
    };
  }
};

export const finalizeMonthlyBillingReportAction = async ({
  reportId,
}: {
  reportId: string;
}): Promise<MonthlyBillingActionResult> => {
  await requireAdmin();

  try {
    const report = await finalizeMonthlyBillingReport({ reportId });

    revalidateBillingPages();
    return {
      ok: true,
      message: `${report.report.account.displayName} ${report.report.status === "finalized" ? "report finalized." : "report updated."}`,
      reportId: report.report.id,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to finalize the monthly billing report.",
    };
  }
};
