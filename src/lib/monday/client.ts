import "server-only";

import { z } from "zod";

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";
const MAX_RETRIES = 5;
const COMPLEXITY_RETRY_CODES = new Set([
  "ComplexityException",
  "RateLimitExceeded",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const errorEntrySchema = z.object({
  message: z.string(),
  extensions: z
    .object({ code: z.string().optional() })
    .passthrough()
    .optional(),
});

const responseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(errorEntrySchema).optional(),
});

export type MondayQueryArgs<T> = {
  query: string;
  variables?: Record<string, unknown>;
  schema: z.ZodType<T>;
};

export type MondayClient = {
  query: <T>(args: MondayQueryArgs<T>) => Promise<T>;
};

const isComplexityRetryError = (
  errors: z.infer<typeof responseSchema>["errors"],
) =>
  errors?.some((entry) =>
    entry.extensions?.code
      ? COMPLEXITY_RETRY_CODES.has(entry.extensions.code)
      : false,
  ) ?? false;

const formatErrors = (errors: z.infer<typeof responseSchema>["errors"]) =>
  (errors ?? []).map((entry) => entry.message).join("; ");

export const createMondayClient = ({
  apiToken,
}: {
  apiToken: string;
}): MondayClient => {
  const post = async (body: string): Promise<unknown> => {
    let attempt = 0;

    while (true) {
      const response = await fetch(MONDAY_API_URL, {
        method: "POST",
        headers: {
          Authorization: apiToken,
          "API-Version": MONDAY_API_VERSION,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        const waitMs = Math.max(1, retryAfter) * 1000;
        attempt += 1;

        if (attempt > MAX_RETRIES) {
          throw new Error(
            `Monday rate limit exhausted after ${MAX_RETRIES} retries.`,
          );
        }

        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "<unreadable>");
        throw new Error(
          `Monday ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
        );
      }

      const json = await response.json();
      const parsed = responseSchema.parse(json);

      // Monday surfaces complexity/rate-limit failures as errors on a 200.
      if (isComplexityRetryError(parsed.errors)) {
        attempt += 1;

        if (attempt > MAX_RETRIES) {
          throw new Error(
            `Monday complexity limit exhausted after ${MAX_RETRIES} retries: ${formatErrors(parsed.errors)}`,
          );
        }

        await sleep(2 ** attempt * 250);
        continue;
      }

      if (parsed.errors && parsed.errors.length > 0) {
        throw new Error(`Monday GraphQL error: ${formatErrors(parsed.errors)}`);
      }

      return parsed.data;
    }
  };

  return {
    query: async ({ query, variables, schema }) => {
      const data = await post(JSON.stringify({ query, variables }));
      return schema.parse(data);
    },
  };
};
