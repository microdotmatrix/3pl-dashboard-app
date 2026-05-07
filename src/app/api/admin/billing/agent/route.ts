import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  createAgentUIStreamResponse,
  stepCountIs,
  tool,
  ToolLoopAgent,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { env } from "@/env";
import { requireAdmin } from "@/lib/auth/access";
import { createZohoInvoiceAction } from "@/lib/billing/actions";
import { getMonthlyBillingReport } from "@/lib/billing/reports";
import { isVendorSlug } from "@/lib/shipments/vendor-colors";
import {
  buildZohoInvoiceUrl,
  getZohoInvoice,
  listZohoInvoices,
} from "@/lib/zoho/books";
import { getZohoContactIdForSlug } from "@/lib/zoho/contact-map";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  reportId: z.string().min(1),
  messages: z.array(z.any()),
});

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const periodFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

const buildSystemPrompt = (
  detail: Awaited<ReturnType<typeof getMonthlyBillingReport>>,
): string => {
  const report = detail.report;
  const channel = report.orderChannelSummary
    ? `B2B ${report.orderChannelSummary.b2bShipmentCount} / D2C ${report.orderChannelSummary.d2cShipmentCount} / Total ${report.orderChannelSummary.totalShipmentCount}`
    : `Total ${report.shipmentCount}`;

  return [
    "You are the billing assistant for the 3PL admin dashboard. Help an internal operator review and manage the current month's billing report and create Zoho Books draft invoices.",
    "",
    "Rules:",
    "- Invoices are ALWAYS drafts. Never confirm, send, or email an invoice.",
    "- Refuse to create an invoice if the report is not finalized.",
    "- Be direct and operational. No filler, no apologies.",
    "- Use tools to read live data; never invent invoice IDs or totals.",
    "",
    "Current report:",
    `- Client: ${report.account.displayName} (${report.account.slug})`,
    `- Period: ${periodFmt.format(report.periodStart)}`,
    `- Status: ${report.status}${report.zohoInvoiceId ? ` (Zoho invoice ${report.zohoInvoiceId})` : ""}`,
    `- Shipments: ${channel}`,
    `- Units picked: ${report.unitsPickedTotal}`,
    `- Packaging total: ${currencyFmt.format(report.packagingCostTotal)}`,
    `- Unmatched shipments: ${report.unmatchedShipmentCount}`,
    `- Storage bins: small ${report.manualMetrics.smallBinCount}, medium ${report.manualMetrics.mediumBinCount}, large ${report.manualMetrics.largeBinCount}`,
    `- Storage cartons: ${report.manualMetrics.additionalCartonsCount}`,
    `- Cartons received: ${numberFmt.format(report.manualMetrics.cartonsReceivedTotal)}`,
    `- Retail returns: ${numberFmt.format(report.manualMetrics.retailReturnsTotal)}`,
    `- Special project hours: ${numberFmt.format(report.manualMetrics.specialProjectHours)}`,
  ].join("\n");
};

const maybeGetCustomerId = (accountSlug: string): string | null => {
  if (!isVendorSlug(accountSlug)) {
    return null;
  }

  try {
    return getZohoContactIdForSlug(accountSlug);
  } catch {
    return null;
  }
};

const buildAgent = ({
  detail,
  reportId,
  customerId,
}: {
  detail: Awaited<ReturnType<typeof getMonthlyBillingReport>>;
  reportId: string;
  customerId: string | null;
}) => {
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

  return new ToolLoopAgent({
    model: openrouter("anthropic/claude-sonnet-4.6"),
    instructions: buildSystemPrompt(detail),
    stopWhen: stepCountIs(5),
    tools: {
      createDraftInvoice: tool({
        description:
          "Create a Zoho Books draft invoice from the current finalized monthly report. Refuses if the report is not finalized or already has an invoice.",
        inputSchema: z.object({}),
        execute: async () => {
          const result = await createZohoInvoiceAction({ reportId });
          if (!result.ok) {
            return { ok: false, message: result.message };
          }

          return {
            ok: true,
            invoiceId: result.invoiceId,
            invoiceUrl: result.invoiceUrl,
            message: "Draft invoice created in Zoho Books.",
          };
        },
      }),
      listRecentInvoices: tool({
        description:
          "List the most recent Zoho Books invoices for the current client.",
        inputSchema: z.object({}),
        execute: async () => {
          if (!customerId) {
            return {
              ok: false,
              message: "No Zoho contact ID configured for this client.",
            };
          }

          const invoices = await listZohoInvoices(customerId);
          return { ok: true, invoices };
        },
      }),
      getInvoiceDetails: tool({
        description: "Retrieve a single Zoho Books invoice by its ID.",
        inputSchema: z.object({
          invoiceId: z.string().min(1),
        }),
        execute: async ({ invoiceId }) => {
          const invoice = await getZohoInvoice(invoiceId);
          return {
            ok: true,
            invoice,
            invoiceUrl: buildZohoInvoiceUrl(invoiceId),
          };
        },
      }),
      getReportData: tool({
        description:
          "Return the structured monthly billing report data for ad-hoc metric questions.",
        inputSchema: z.object({}),
        execute: async () => ({
          ok: true,
          report: {
            ...detail.report,
            periodStart: detail.report.periodStart.toISOString(),
            periodEnd: detail.report.periodEnd.toISOString(),
            generatedAt: detail.report.generatedAt.toISOString(),
            finalizedAt: detail.report.finalizedAt?.toISOString() ?? null,
          },
          shipmentCount: detail.shipments.length,
        }),
      }),
    },
  });
};

export const POST = async (request: Request) => {
  await requireAdmin();

  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { reportId, messages } = parsed.data;
  const detail = await getMonthlyBillingReport({ reportId });
  const customerId = maybeGetCustomerId(detail.report.account.slug);

  return createAgentUIStreamResponse({
    agent: buildAgent({ detail, reportId, customerId }),
    uiMessages: messages as UIMessage[],
    abortSignal: request.signal,
  });
};
