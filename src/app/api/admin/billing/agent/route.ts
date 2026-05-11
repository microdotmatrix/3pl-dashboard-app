import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  createAgentUIStreamResponse,
  stepCountIs,
  ToolLoopAgent,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { env } from "@/env";
import { requireAdmin } from "@/lib/auth/access";
import {
  createZohoInvoiceAction,
  revertMonthlyBillingReportAction,
} from "@/lib/billing/actions";
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
    "Revert protocol:",
    "- When a user asks to revert a finalized report, you MUST: (1) state which invoice will be voided in Zoho and which vendor/period the report is for; (2) ask the user to provide a written reason and to reply with the exact phrase CONFIRM REVERT; (3) only then call the revertMonthlyBillingReport tool with both fields.",
    "- Never call the revert tool on the first turn. Never paraphrase the confirmation phrase.",
    "- If voiding fails (e.g., paid invoice), surface the error verbatim and do not retry. Tell the user to resolve the payment in Zoho first.",
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
    `- Pallets received: ${numberFmt.format(report.manualMetrics.palletsReceivedTotal)}`,
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

const textFromMessage = (message: unknown): string => {
  if (!message || typeof message !== "object") {
    return "";
  }

  const maybe = message as {
    role?: unknown;
    content?: unknown;
    parts?: unknown;
  };

  if (typeof maybe.content === "string") {
    return maybe.content;
  }

  if (Array.isArray(maybe.parts)) {
    return maybe.parts
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
};

const getLatestUserText = (messages: unknown[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: unknown };
    if (message?.role === "user") {
      return textFromMessage(message);
    }
  }

  return "";
};

const buildAgent = ({
  detail,
  reportId,
  customerId,
  latestUserText,
}: {
  detail: Awaited<ReturnType<typeof getMonthlyBillingReport>>;
  reportId: string;
  customerId: string | null;
  latestUserText: string;
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
      revertMonthlyBillingReport: tool({
        description:
          "Revert the current finalized report back to draft and void the linked Zoho invoice. Requires a written reason and the exact confirmation phrase.",
        inputSchema: z.object({
          reason: z.string().min(3, "Reason must be at least 3 characters."),
          confirm: z.literal("CONFIRM REVERT"),
        }),
        execute: async ({ reason }) => {
          if (!latestUserText.includes("CONFIRM REVERT")) {
            return {
              ok: false,
              message:
                "The latest user message did not include CONFIRM REVERT.",
            };
          }

          const result = await revertMonthlyBillingReportAction({
            reportId,
            reason,
          });

          if (!result.ok) {
            return { ok: false, message: result.message };
          }

          return {
            ok: true,
            message: result.message,
            voidedInvoiceId: result.voidedInvoiceId,
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
  const latestUserText = getLatestUserText(messages);

  return createAgentUIStreamResponse({
    agent: buildAgent({ detail, reportId, customerId, latestUserText }),
    uiMessages: messages as UIMessage[],
    abortSignal: request.signal,
  });
};
