import "dotenv/config";

import { backfillMissingShipmentItemsForAccount } from "../src/lib/shipstation/item-backfill";

const ACCOUNT_SLUGS = ["dip", "fatass", "ryot"] as const;

const getOption = (name: string) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const parseDate = (name: string) => {
  const value = getOption(name);
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`--${name} must be a valid ISO date.`);
  }
  return date;
};

const main = async () => {
  const account = getOption("account");
  if (
    !account ||
    !ACCOUNT_SLUGS.includes(account as (typeof ACCOUNT_SLUGS)[number])
  ) {
    throw new Error("--account must be one of: dip, fatass, ryot.");
  }

  const limitValue = getOption("limit");
  const limit = limitValue ? Number(limitValue) : undefined;
  const apply = process.argv.includes("--apply");

  const result = await backfillMissingShipmentItemsForAccount({
    accountSlug: account,
    from: parseDate("from"),
    to: parseDate("to"),
    limit,
    apply,
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        account,
        ...result,
      },
      null,
      2,
    ),
  );

  if (result.failed > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
