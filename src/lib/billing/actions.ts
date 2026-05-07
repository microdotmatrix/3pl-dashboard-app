"use server";

import { eq } from "drizzle-orm";
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
import { createZohoInvoice } from "@/lib/zoho/books";
import { buildZohoInvoiceUrl } from "@/lib/zoho/urls";

import {
  finalizeMonthlyBillingReport,
  generateMonthlyBillingReport,
  getMonthlyBillingReport,
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
  const retailReturnsTotal = parseIntegerField(
    formData,
    "retailReturnsTotal",
    "Retail returns total",
    fieldErrors,
  );
  const specialProjectHours = parseSpecialProjectHours(formData, fieldErrors);

  if (
    smallBinCount === null ||
    mediumBinCount === null ||
    largeBinCount === null ||
    additionalCartonsCount === null ||
    cartonsReceivedTotal === null ||
    retailReturnsTotal === null ||
    specialProjectHours === null
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
      retailReturnsTotal,
      specialProjectHours,
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
    };
  }

  const { manualMetrics, fieldErrors } = getManualMetricsFromFormData(formData);
  if (!manualMetrics) {
    return {
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors,
      manualMetrics: previousState.manualMetrics,
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
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to save the monthly report metrics.",
      manualMetrics: previousState.manualMetrics ?? manualMetrics,
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

    await db
      .update(monthlyBillingReport)
      .set({ zohoInvoiceId: invoice.invoiceId })
      .where(eq(monthlyBillingReport.id, reportId));

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
