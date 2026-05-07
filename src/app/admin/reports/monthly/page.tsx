import { formatDistanceToNow } from "date-fns";
import { desc } from "drizzle-orm";

import { MonthlyReportActions } from "@/components/admin/monthly-report-actions";
import { MonthlyReportMetricsForm } from "@/components/admin/monthly-report-metrics-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { shipstationAccount } from "@/db/schema/shipstation";
import { isBillingSheetConfigured } from "@/lib/billing/config";
import {
  getMonthlyBillingReportForPeriod,
  listMonthlyBillingReports,
} from "@/lib/billing/reports";
import type { BillingAccountSlug } from "@/lib/billing/types";
import { buildZohoInvoiceUrl } from "@/lib/zoho/urls";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type MonthlyReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getSingle = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const defaultMonthValue = () => {
  const now = new Date();
  const year =
    now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
};

const parseMonthValue = (value: string | undefined) => {
  const input = value?.trim() || defaultMonthValue();
  const match = /^(\d{4})-(\d{2})$/.exec(input);

  if (!match) {
    return {
      year: Number(defaultMonthValue().slice(0, 4)),
      month: Number(defaultMonthValue().slice(5, 7)),
      value: defaultMonthValue(),
    };
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    value: input,
  };
};

const formatDate = (date: Date | null) =>
  date ? dateFormatter.format(date) : "—";

const matchStatusClass = (value: string) => {
  if (value === "matched") return "text-emerald-700 dark:text-emerald-400";
  if (value === "partial") return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
};

const packageDetailLabel = (
  matches: Array<{
    packageIndex: number;
    matched: boolean;
    pricingSource: "exact" | "fallback" | "none";
    ruleLabel: string | null;
    costApplied: number;
    originalDimensions: {
      length: number | null;
      width: number | null;
      height: number | null;
    };
    reason: string | null;
  }>,
) =>
  matches.map((match) => {
    const dims = [
      match.originalDimensions.length,
      match.originalDimensions.width,
      match.originalDimensions.height,
    ]
      .map((value) => (value === null ? "?" : String(value)))
      .join(" × ");

    if (match.pricingSource === "exact") {
      return `#${match.packageIndex} ${match.ruleLabel} ${currencyFormatter.format(match.costApplied)} (${dims})`;
    }

    if (match.pricingSource === "fallback") {
      return `#${match.packageIndex} Estimated ${currencyFormatter.format(match.costApplied)} (${dims}) · ${match.reason ?? "Fallback pricing applied"}`;
    }

    return `#${match.packageIndex} ${match.reason ?? "Unmatched"} (${dims})`;
  });

const MonthlyReportsPage = async ({
  searchParams,
}: MonthlyReportsPageProps) => {
  const raw = await searchParams;
  const accounts = await db
    .select({
      id: shipstationAccount.id,
      slug: shipstationAccount.slug,
      displayName: shipstationAccount.displayName,
    })
    .from(shipstationAccount)
    .orderBy(desc(shipstationAccount.createdAt));

  if (accounts.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No ShipStation accounts found</AlertTitle>
        <AlertDescription>
          Seed the client accounts before using monthly billing reports.
        </AlertDescription>
      </Alert>
    );
  }

  const selectedAccountSlug =
    getSingle(raw.account) &&
    accounts.some((account) => account.slug === getSingle(raw.account))
      ? (getSingle(raw.account) as string)
      : accounts[0].slug;
  const selectedAccount =
    accounts.find((account) => account.slug === selectedAccountSlug) ??
    accounts[0];
  const selectedMonth = parseMonthValue(getSingle(raw.month));

  const [currentReport, reportHistory] = await Promise.all([
    getMonthlyBillingReportForPeriod({
      accountSlug: selectedAccount.slug,
      year: selectedMonth.year,
      month: selectedMonth.month,
    }),
    listMonthlyBillingReports({ accountSlug: selectedAccount.slug }),
  ]);

  const sheetConfigured = isBillingSheetConfigured(selectedAccount.slug);
  const canFinalize =
    currentReport !== null && currentReport.report.status === "draft";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Monthly billing reports</CardTitle>
          <CardDescription>
            Generate draft packaging reports from synced ShipStation shipments,
            review exceptions, export invoice support, and freeze reviewed
            months.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-3 md:flex-row md:items-end">
            <FieldGroup className="grid gap-3 md:flex-1 md:grid-cols-[minmax(0,_1fr)_minmax(0,_220px)]">
              <Field>
                <FieldLabel htmlFor="monthly-report-account">Client</FieldLabel>
                <NativeSelect
                  id="monthly-report-account"
                  name="account"
                  defaultValue={selectedAccount.slug}
                  className="w-full"
                >
                  {accounts.map((account) => (
                    <NativeSelectOption key={account.id} value={account.slug}>
                      {account.displayName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="monthly-report-month">Month</FieldLabel>
                <Input
                  id="monthly-report-month"
                  name="month"
                  type="month"
                  defaultValue={selectedMonth.value}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" variant="outline">
              Load report
            </Button>
          </form>

          <MonthlyReportActions
            accountSlug={selectedAccount.slug as BillingAccountSlug}
            year={selectedMonth.year}
            month={selectedMonth.month}
            reportId={currentReport?.report.id ?? null}
            reportStatus={currentReport?.report.status ?? null}
            zohoInvoiceId={currentReport?.report.zohoInvoiceId ?? null}
            periodLabel={
              currentReport
                ? monthFormatter.format(currentReport.report.periodStart)
                : `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}`
            }
            canFinalize={canFinalize}
            unmatchedShipmentCount={
              currentReport?.report.unmatchedShipmentCount ?? 0
            }
            sheetConfigured={sheetConfigured}
          />

          {!sheetConfigured ? (
            <Alert variant="destructive">
              <AlertTitle>Billing sheet configuration is incomplete</AlertTitle>
              <AlertDescription>
                Set <code>BILLING_RATES_SPREADSHEET_ID</code> and the{" "}
                <code>BILLING_RATES_GID</code> env var for the shared package
                cost tab before generating drafts for{" "}
                {selectedAccount.displayName} before generating drafts.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {currentReport ? (
        <>
          {(() => {
            const channelSummary = currentReport.report.orderChannelSummary;
            const periodLabel = monthFormatter.format(
              currentReport.report.periodStart,
            );
            const stats: Array<{
              key: string;
              label: string;
              note: React.ReactNode;
              value: React.ReactNode;
            }> = channelSummary
              ? [
                  {
                    key: "b2b",
                    label: "B2B shipments",
                    note: (
                      <>
                        Shipment # starts with <code>B2B</code>
                      </>
                    ),
                    value: channelSummary.b2bShipmentCount,
                  },
                  {
                    key: "d2c",
                    label: "D2C shipments",
                    note: (
                      <>
                        Shipment # does not start with <code>B2B</code>
                      </>
                    ),
                    value: channelSummary.d2cShipmentCount,
                  },
                  {
                    key: "total",
                    label: "Total shipments",
                    note: periodLabel,
                    value: channelSummary.totalShipmentCount,
                  },
                ]
              : [
                  {
                    key: "shipments",
                    label: "Shipment count",
                    note: periodLabel,
                    value: currentReport.report.shipmentCount,
                  },
                ];

            stats.push(
              {
                key: "units",
                label: "Units picked",
                note: "Sum of line-item quantities",
                value: currentReport.report.unitsPickedTotal,
              },
              {
                key: "packages",
                label: "Package count",
                note: "All package rows evaluated",
                value: currentReport.report.packageCount,
              },
              {
                key: "packaging-total",
                label: "Packaging total",
                note: "Snapshot for invoice prep",
                value: currencyFormatter.format(
                  currentReport.report.packagingCostTotal,
                ),
              },
              {
                key: "unmatched",
                label: "Unmatched shipments",
                note: "Values shown are estimated costs",
                value: currentReport.report.unmatchedShipmentCount,
              },
            );

            return (
              <Card size="sm">
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[28%]">Metric</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-[18%] text-right">
                          Value
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.map((stat) => (
                        <TableRow key={stat.key}>
                          <TableCell className="font-medium">
                            {stat.label}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {stat.note}
                          </TableCell>
                          <TableCell className="text-right font-heading text-base font-semibold tabular-nums">
                            {stat.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })()}

          <MonthlyReportMetricsForm
            reportId={currentReport.report.id}
            reportStatus={currentReport.report.status}
            manualMetrics={currentReport.report.manualMetrics}
          />

          <Card>
            <CardHeader>
              <CardTitle>
                {selectedAccount.displayName} ·{" "}
                {monthFormatter.format(currentReport.report.periodStart)}
              </CardTitle>
              <CardDescription>
                Status:{" "}
                <span className="font-medium">
                  {currentReport.report.status}
                </span>
                {" · "}
                Generated {formatDate(currentReport.report.generatedAt)}
                {currentReport.report.finalizedAt
                  ? ` · Finalized ${formatDate(currentReport.report.finalizedAt)}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {currentReport.report.unmatchedShipmentCount > 0 ? (
                <Alert variant="destructive">
                  <AlertTitle>Exceptions need review</AlertTitle>
                  <AlertDescription>
                    One or more shipments could not be matched to a carton rule.
                    Regenerate after updating the public rate sheet.
                  </AlertDescription>
                </Alert>
              ) : null}

              {currentReport.report.lastRevertedAt ||
              currentReport.report.previousZohoInvoiceIds.length > 0 ? (
                <div className="rounded-md border border-muted-foreground/20 bg-muted/30 p-3 text-xs text-muted-foreground">
                  {currentReport.report.lastRevertedAt ? (
                    <p>
                      Last reverted{" "}
                      {formatDistanceToNow(
                        currentReport.report.lastRevertedAt,
                        { addSuffix: true },
                      )}{" "}
                      by{" "}
                      <span className="font-medium">
                        {currentReport.report.lastRevertedByName ??
                          currentReport.report.lastRevertedBy ??
                          "unknown user"}
                      </span>
                      {currentReport.report.lastRevertReason
                        ? ` — reason: "${currentReport.report.lastRevertReason}"`
                        : ""}
                      .
                    </p>
                  ) : null}
                  {currentReport.report.previousZohoInvoiceIds.length > 0 ? (
                    <p className="mt-1">
                      Previous invoices:{" "}
                      {currentReport.report.previousZohoInvoiceIds.map(
                        (id, index) => (
                          <span key={id}>
                            {index > 0 ? ", " : ""}
                            <a
                              href={buildZohoInvoiceUrl(id)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              {id}
                            </a>
                          </span>
                        ),
                      )}
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shipment</TableHead>
                    <TableHead>Billable date</TableHead>
                    <TableHead>Shipment #</TableHead>
                    <TableHead className="hidden">Order ID</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Units picked</TableHead>
                    <TableHead>Packages</TableHead>
                    <TableHead>Packaging total</TableHead>
                    <TableHead className="min-w-[320px] whitespace-normal">
                      Package audit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentReport.shipments.map((shipment) => {
                    const details = packageDetailLabel(shipment.packageMatches);
                    return (
                      <TableRow key={shipment.id}>
                        <TableCell className="font-mono text-[0.7rem]">
                          {shipment.externalId}
                        </TableCell>
                        <TableCell>{formatDate(shipment.shipDate)}</TableCell>
                        <TableCell className="font-mono text-[0.7rem] text-muted-foreground">
                          {shipment.shipmentNumber ?? "—"}
                        </TableCell>
                        <TableCell className="hidden font-mono text-[0.7rem] text-muted-foreground">
                          {shipment.externalShipmentId ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={matchStatusClass(shipment.matchStatus)}
                          >
                            {shipment.matchStatus}
                          </span>
                        </TableCell>
                        <TableCell>{shipment.unitsPicked}</TableCell>
                        <TableCell>{shipment.packageCount}</TableCell>
                        <TableCell>
                          {currencyFormatter.format(
                            shipment.packagingCostTotal,
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-col gap-1">
                            {details.map((detail) => (
                              <span
                                key={detail}
                                className="text-[0.7rem] text-muted-foreground"
                              >
                                {detail}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {currentReport.shipments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="whitespace-normal text-muted-foreground"
                      >
                        No billable shipments landed in this month for{" "}
                        {selectedAccount.displayName}.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Alert>
          <AlertTitle>No report snapshot yet</AlertTitle>
          <AlertDescription>
            Load a client and month, then generate a draft to create the first
            snapshot.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent reports</CardTitle>
          <CardDescription>
            Existing snapshots for {selectedAccount.displayName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Shipments</TableHead>
                <TableHead>Packages</TableHead>
                <TableHead>Packaging total</TableHead>
                <TableHead>Generated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportHistory.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <a
                      className="underline underline-offset-4"
                      href={`/admin/reports/monthly?account=${encodeURIComponent(
                        report.account.slug,
                      )}&month=${report.periodStart.toISOString().slice(0, 7)}`}
                    >
                      {monthFormatter.format(report.periodStart)}
                    </a>
                  </TableCell>
                  <TableCell>{report.status}</TableCell>
                  <TableCell>{report.shipmentCount}</TableCell>
                  <TableCell>{report.packageCount}</TableCell>
                  <TableCell>
                    {currencyFormatter.format(report.packagingCostTotal)}
                  </TableCell>
                  <TableCell>{formatDate(report.generatedAt)}</TableCell>
                </TableRow>
              ))}
              {reportHistory.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="whitespace-normal text-muted-foreground"
                  >
                    No reports have been generated for this client yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonthlyReportsPage;
