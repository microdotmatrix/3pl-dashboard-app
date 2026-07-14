const MAX_RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const requestShipstation = async (
  url: string,
  apiKey: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
  } = {},
): Promise<unknown> => {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "API-Key": apiKey,
        Accept: "application/json",
        ...init.headers,
      },
      body: init.body,
      cache: "no-store",
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      const waitMs = Math.max(1, retryAfter) * 1000;
      attempt += 1;

      if (attempt > MAX_RETRIES) {
        throw new Error(
          `ShipStation rate limit exhausted after ${MAX_RETRIES} retries for ${url}`,
        );
      }

      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable>");
      throw new Error(
        `ShipStation ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 500)}`,
      );
    }

    if (response.status === 204) {
      return undefined;
    }

    return response.json();
  }
};
