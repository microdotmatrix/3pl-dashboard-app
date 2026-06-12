"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { monthlyBillingReport } from "@/db/schema/billing";
import { requireAdmin } from "@/lib/auth/access";
import type { MonthlyBillingMetricsActionState } from "@/lib/billing/action-state";
import { buildInvoiceParams } from "@/lib/billing/invoice-builder";
import type {
  BillingAccountSlug,
  BillingManualMetrics,
} from "@/lib/billing/types";
import { isVendorSlug } from "@/lib/shipments/vendor-colors";
import { createZohoInvoice, voidZohoInvoice } from "@/lib/zoho/books";
import { buildZohoInvoiceUrl } from "@/lib/zoho/urls";

import {
  finalizeMonthlyBillingReport,
  generateMonthlyBillingReport,
  getMonthlyBillingReport,
  refreshMondayMetricsForReport,
  revertMonthlyBillingReport,
  updateMonthlyBillingReportManualMetrics,
} from "./reports";

export type MonthlyBillingActionResult = {
  ok: boolean;
  message: string;
  reportId?: string;
};

export type CreateZohoInvoiceActionResult =
  | { ok: true; invoiceId: string; invoiceUrl: string }
  | { ok: false; message: string };

export type RevertMonthlyBillingReportActionResult =
  | {
      ok: true;
      message: string;
      reportId: string;
      voidedInvoiceId: string | null;
    }
  | { ok: false; message: string };

const revalidateBillingPages = () => {
  revalidatePath("/admin/reports/monthly");
};

const getString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const parseIntegerField = (
  formData: FormData,
  key: keyof BillingManualMetrics,
  label: string,
  fieldErrors: Record<string, string>,
) => {
  const rawValue = getString(formData, key);

  if (rawValue === "") {
    return 0;
  }

  if (!/^\d+$/.test(rawValue)) {
    fieldErrors[key] =
      `${label} must be a whole number greater than or equal to 0.`;
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 0) {
    fieldErrors[key] =
      `${label} must be a whole number greater than or equal to 0.`;
    return null;
  }

  return value;
};

const parseSpecialProjectHours = (
  formData: FormData,
  fieldErrors: Record<string, string>,
) => {
  const rawValue = getString(formData, "specialProjectHours");

  if (rawValue === "") {
    return 0;
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(rawValue)) {
    fieldErrors.specialProjectHours =
      "Special project hours must be a number with up to 2 decimal places.";
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    fieldErrors.specialProjectHours =
      "Special project hours must be greater than or equal to 0.";
    return null;
  }

  return value;
};

const getManualMetricsFromFormData = (
  formData: FormData,
): {
  manualMetrics: BillingManualMetrics | null;
  fieldErrors: Record<string, string>;
} => {
  const fieldErrors: Record<string, string> = {};
  const smallBinCount = parseIntegerField(
    formData,
    "smallBinCount",
    "Small bin count",
    fieldErrors,
  );
  const mediumBinCount = parseIntegerField(
    formData,
    "mediumBinCount",
    "Medium bin count",
    fieldErrors,
  );
  const largeBinCount = parseIntegerField(
    formData,
    "largeBinCount",
    "Large bin count",
    fieldErrors,
  );
  const additionalCartonsCount = parseIntegerField(
    formData,
    "additionalCartonsCount",
    "Additional cartons",
    fieldErrors,
  );
  const cartonsReceivedTotal = parseIntegerField(
    formData,
    "cartonsReceivedTotal",
    "Cartons received total",
    fieldErrors,
  );
  const palletsReceivedTotal = parseIntegerField(
    formData,
    "palletsReceivedTotal",
    "Pallets received total",
    fieldErrors,
  );
  const retailReturnsTotal = parseIntegerField(
    formData,
    "retailReturnsTotal",
    "Retail returns total",
    fieldErrors,
  );
  const specialProjectHours = parseSpecialProjectHours(formData, fieldErrors);
  const specialUseCaseOrdersCount = parseIntegerField(
    formData,
    "specialUseCaseOrdersCount",
    "Special use case orders",
    fieldErrors,
  );

  if (
    smallBinCount === null ||
    mediumBinCount === null ||
    largeBinCount === null ||
    additionalCartonsCount === null ||
    cartonsReceivedTotal === null ||
    palletsReceivedTotal === null ||
    retailReturnsTotal === null ||
    specialProjectHours === null ||
    specialUseCaseOrdersCount === null
  ) {
    return { manualMetrics: null, fieldErrors };
  }

  return {
    manualMetrics: {
      smallBinCount,
      mediumBinCount,
      largeBinCount,
      additionalCartonsCount,
      cartonsReceivedTotal,
      palletsReceivedTotal,
      retailReturnsTotal,
      specialProjectHours,
      specialUseCaseOrdersCount,
    },
    fieldErrors,
  };
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
    const { detail, mondayPull } = await generateMonthlyBillingReport({
      accountSlug,
      year,
      month,
    });

    revalidateBillingPages();

    if (mondayPull.ok) {
      const warningsNote =
        mondayPull.warningsCount > 0
          ? ` ${mondayPull.warningsCount} Monday warning${mondayPull.warningsCount === 1 ? "" : "s"} — review the report.`
          : "";
      return {
        ok: true,
        message: `Draft report generated for ${detail.report.account.displayName}. Pulled metrics from Monday.${warningsNote}`,
        reportId: detail.report.id,
      };
    }

    return {
      ok: false,
      message: `Draft created from ShipStation for ${detail.report.account.displayName}, but Monday is unreachable: ${mondayPull.error}. Open the report to enter metrics manually, or click Refresh from Monday once the connection is restored.`,
      reportId: detail.report.id,
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

export type RefreshMondayMetricsActionResult =
  | {
      ok: true;
      message: string;
      reportId: string;
      warningsCount: number;
    }
  | { ok: false; message: string };

export const refreshMondayMetricsAction = async ({
  reportId,
}: {
  reportId: string;
}): Promise<RefreshMondayMetricsActionResult> => {
  await requireAdmin();

  try {
    const { detail, warningsCount, fetchedAt } =
      await refreshMondayMetricsForReport({ reportId });

    revalidateBillingPages();

    const warningsNote =
      warningsCount > 0
        ? ` ${warningsCount} warning${warningsCount === 1 ? "" : "s"} — review the report.`
        : "";

    return {
      ok: true,
      message: `Refreshed Monday metrics for ${detail.report.account.displayName} at ${fetchedAt.toLocaleTimeString()}.${warningsNote}`,
      reportId: detail.report.id,
      warningsCount,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to refresh Monday metrics.",
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

export const saveMonthlyBillingReportManualMetricsAction = async (
  previousState: MonthlyBillingMetricsActionState,
  formData: FormData,
): Promise<MonthlyBillingMetricsActionState> => {
  await requireAdmin();

  const reportId = getString(formData, "reportId");
  if (!reportId) {
    return {
      status: "error",
      message: "Missing report id.",
      manualMetrics: previousState.manualMetrics,
      manualMetricsOverrides: previousState.manualMetricsOverrides,
    };
  }

  const { manualMetrics, fieldErrors } = getManualMetricsFromFormData(formData);
  if (!manualMetrics) {
    return {
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors,
      manualMetrics: previousState.manualMetrics,
      manualMetricsOverrides: previousState.manualMetricsOverrides,
    };
  }

  try {
    const report = await updateMonthlyBillingReportManualMetrics({
      reportId,
      manualMetrics,
    });

    revalidateBillingPages();
    return {
      status: "success",
      message: `Saved month-end metrics for ${report.report.account.displayName}.`,
      manualMetrics: report.report.manualMetrics,
      manualMetricsOverrides: report.report.manualMetricsOverrides,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to save the monthly report metrics.",
      manualMetrics: previousState.manualMetrics ?? manualMetrics,
      manualMetricsOverrides: previousState.manualMetricsOverrides,
    };
  }
};

export const createZohoInvoiceAction = async ({
  reportId,
}: {
  reportId: string;
}): Promise<CreateZohoInvoiceActionResult> => {
  await requireAdmin();

  try {
    const detail = await getMonthlyBillingReport({ reportId });

    if (detail.report.status !== "finalized") {
      return {
        ok: false,
        message: "Finalize the report before creating a Zoho invoice.",
      };
    }

    if (detail.report.zohoInvoiceId) {
      return {
        ok: true,
        invoiceId: detail.report.zohoInvoiceId,
        invoiceUrl: buildZohoInvoiceUrl(detail.report.zohoInvoiceId),
      };
    }

    const slug = detail.report.account.slug;
    if (!isVendorSlug(slug)) {
      return {
        ok: false,
        message: `Account slug "${slug}" is not a configured billing account.`,
      };
    }

    const invoice = await createZohoInvoice(
      buildInvoiceParams(detail, slug as BillingAccountSlug),
    );

    const [linked] = await db
      .update(monthlyBillingReport)
      .set({ zohoInvoiceId: invoice.invoiceId })
      .where(
        and(
          eq(monthlyBillingReport.id, reportId),
          eq(monthlyBillingReport.status, "finalized"),
          isNull(monthlyBillingReport.zohoInvoiceId),
        ),
      )
      .returning({ id: monthlyBillingReport.id });

    if (!linked) {
      try {
        await voidZohoInvoice(invoice.invoiceId);
      } catch (voidError) {
        const message =
          voidError instanceof Error
            ? voidError.message
            : "Zoho Books cleanup failed.";
        console.error("createZohoInvoiceAction: orphan cleanup failed", {
          reportId,
          invoiceId: invoice.invoiceId,
          message,
        });

        return {
          ok: false,
          message: `Invoice ${invoice.invoiceId} was created in Zoho, but the report changed before it could be linked. Void it manually in Zoho. Cleanup error: ${message}`,
        };
      }

      return {
        ok: false,
        message:
          "The report changed while creating the invoice. The newly-created Zoho invoice was voided; refresh and try again.",
      };
    }

    revalidateBillingPages();

    return {
      ok: true,
      invoiceId: invoice.invoiceId,
      invoiceUrl: invoice.invoiceUrl ?? buildZohoInvoiceUrl(invoice.invoiceId),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to create Zoho invoice.",
    };
  }
};

export const revertMonthlyBillingReportAction = async ({
  reportId,
  reason,
}: {
  reportId: string;
  reason: string;
}): Promise<RevertMonthlyBillingReportActionResult> => {
  const session = await requireAdmin();

  try {
    const detail = await getMonthlyBillingReport({ reportId });
    const voidedInvoiceId = detail.report.zohoInvoiceId;

    const updated = await revertMonthlyBillingReport({
      reportId,
      reason,
      userId: session.user.id,
    });

    revalidateBillingPages();

    return {
      ok: true,
      message: voidedInvoiceId
        ? `Report reverted. Invoice ${voidedInvoiceId} voided in Zoho.`
        : "Report reverted. Metrics are editable again.",
      reportId: updated.report.id,
      voidedInvoiceId,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to revert the monthly billing report.",
    };
  }
};
