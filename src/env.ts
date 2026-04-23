import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
    ADMIN_EMAIL: z.string().email().optional(),
    SHIPSTATION_API_KEY_DIP: z.string().min(1),
    SHIPSTATION_API_KEY_FATASS: z.string().min(1),
    SHIPSTATION_API_KEY_RYOT: z.string().min(1),
    CRON_SECRET: z.string().min(16),
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
  },
});
