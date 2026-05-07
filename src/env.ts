import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    ADMIN_EMAIL: z.email().optional(),
    SHIPSTATION_API_KEY_DIP: z.string().min(1),
    SHIPSTATION_API_KEY_FATASS: z.string().min(1),
    SHIPSTATION_API_KEY_RYOT: z.string().min(1),
    CRON_SECRET: z.string().min(16),
    BILLING_RATES_SPREADSHEET_ID: z.string().min(1).optional(),
    BILLING_RATES_GID: z.string().min(1).optional(),
    MEMBRANE_WORKSPACE_KEY: z.string().min(1),
    MEMBRANE_WORKSPACE_SECRET: z.string().min(1),
    MEMBRANE_ZOHO_CONNECTION_ID: z.string().min(1),
    OPENROUTER_API_KEY: z.string().min(1),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    SHIPSTATION_API_KEY_DIP: process.env.SHIPSTATION_API_KEY_DIP,
    SHIPSTATION_API_KEY_FATASS: process.env.SHIPSTATION_API_KEY_FATASS,
    SHIPSTATION_API_KEY_RYOT: process.env.SHIPSTATION_API_KEY_RYOT,
    CRON_SECRET: process.env.CRON_SECRET,
    BILLING_RATES_SPREADSHEET_ID: process.env.BILLING_RATES_SPREADSHEET_ID,
    BILLING_RATES_GID: process.env.BILLING_RATES_GID,
    MEMBRANE_WORKSPACE_KEY: process.env.MEMBRANE_WORKSPACE_KEY,
    MEMBRANE_WORKSPACE_SECRET: process.env.MEMBRANE_WORKSPACE_SECRET,
    MEMBRANE_ZOHO_CONNECTION_ID: process.env.MEMBRANE_ZOHO_CONNECTION_ID,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  },
});
