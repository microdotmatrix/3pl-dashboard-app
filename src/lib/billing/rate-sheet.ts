import "server-only";

import { createHash } from "node:crypto";

import { getBillingSheetConfig } from "./config";
import { normalizeRateDimensions } from "./dimension-match";
import type { BillingRateRow } from "./types";

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

const parseMoney = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const csvExportUrl = (spreadsheetId: string, sheetGid: string) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=csv&gid=${encodeURIComponent(sheetGid)}`;

const hashSource = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const parseCsv = (value: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  const flushCell = () => {
    currentRow.push(currentValue);
    currentValue = "";
  };

  const flushRow = () => {
    flushCell();
    rows.push(currentRow);
    currentRow = [];
  };

  const normalized = value.replace(/^\uFEFF/, "");

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      flushCell();
      continue;
    }

    if (char === "\n" && !inQuotes) {
      flushRow();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    flushRow();
  }

  return rows;
};

const resolveColumnIndex = (
  headers: string[],
  aliases: string[],
  label: string,
): number => {
  const normalizedAliases = aliases.map(normalizeHeader);
  const index = headers.findIndex((header) =>
    normalizedAliases.includes(normalizeHeader(header)),
  );

  if (index === -1) {
    throw new Error(`Rate sheet is missing a "${label}" column.`);
  }

  return index;
};

export const loadBillingRateSheet = async (
  accountSlug: string,
): Promise<{
  sheetSourceHash: string;
  rateRows: BillingRateRow[];
}> => {
  const config = getBillingSheetConfig(accountSlug);

  if (!config.spreadsheetId || !config.sheetGid) {
    throw new Error(
      `Billing rate sheet is not configured for "${accountSlug}". Set BILLING_RATES_SPREADSHEET_ID and BILLING_RATES_GID.`,
    );
  }

  const response = await fetch(
    csvExportUrl(config.spreadsheetId, config.sheetGid),
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch billing rate sheet for "${accountSlug}" (${response.status} ${response.statusText}).`,
    );
  }

  const csvText = await response.text();
  const parsed = parseCsv(csvText);
  const headerIndex = Math.max(0, config.headerRow - 1);
  const headerRow = parsed[headerIndex];

  if (!headerRow) {
    throw new Error(`Billing rate sheet for "${accountSlug}" is empty.`);
  }

  const labelIndex = resolveColumnIndex(
    headerRow,
    config.columns.label,
    "label",
  );
  const lengthIndex = resolveColumnIndex(
    headerRow,
    config.columns.length,
    "length",
  );
  const widthIndex = resolveColumnIndex(
    headerRow,
    config.columns.width,
    "width",
  );
  const heightIndex = resolveColumnIndex(
    headerRow,
    config.columns.height,
    "height",
  );
  const costIndex = resolveColumnIndex(headerRow, config.columns.cost, "cost");

  const rateRows: BillingRateRow[] = [];
  const seen = new Set<string>();

  for (let index = headerIndex + 1; index < parsed.length; index += 1) {
    const row = parsed[index] ?? [];
    if (row.every((cell) => cell.trim().length === 0)) {
      continue;
    }

    const label = row[labelIndex]?.trim() ?? "";
    const length = parseNumber(row[lengthIndex] ?? "");
    const width = parseNumber(row[widthIndex] ?? "");
    const height = parseNumber(row[heightIndex] ?? "");
    const cost = parseMoney(row[costIndex] ?? "");

    if (
      !label &&
      length === null &&
      width === null &&
      height === null &&
      cost === null
    ) {
      continue;
    }

    if (
      !label ||
      length === null ||
      width === null ||
      height === null ||
      cost === null
    ) {
      throw new Error(
        `Billing rate sheet row ${index + 1} is incomplete for "${accountSlug}".`,
      );
    }

    const normalized = normalizeRateDimensions(length, width, height);

    if (seen.has(normalized.normalizedKey)) {
      throw new Error(
        `Duplicate carton dimensions "${normalized.normalizedKey}" found in billing rate sheet row ${index + 1}.`,
      );
    }

    seen.add(normalized.normalizedKey);
    rateRows.push({
      label,
      length,
      width,
      height,
      cost,
      normalizedKey: normalized.normalizedKey,
      sourceRowNumber: index + 1,
    });
  }

  if (rateRows.length === 0) {
    throw new Error(`No billing rate rows were found for "${accountSlug}".`);
  }

  return {
    sheetSourceHash: hashSource(csvText),
    rateRows,
  };
};
