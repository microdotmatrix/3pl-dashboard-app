import "server-only";

import { MembraneClient } from "@membranehq/sdk";
import jwt from "jsonwebtoken";

import { env } from "@/env";

const TOKEN_TTL_SECONDS = 60 * 30;
const MEMBRANE_SUBJECT = "3pl-dashboard-app";

const mintMembraneToken = (): string => {
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      // The installed Membrane SDK expects workspace-scoped tokens with
      // `iss` and tenant/app identity in `id`.
      iss: env.MEMBRANE_WORKSPACE_KEY,
      id: MEMBRANE_SUBJECT,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    },
    env.MEMBRANE_WORKSPACE_SECRET,
    { algorithm: "HS256" },
  );
};

/**
 * Returns an initialized server-side Membrane client.
 * Token is minted directly from workspace credentials — no fetch round-trip.
 */
export const getMembraneClient = (): MembraneClient =>
  new MembraneClient({ token: mintMembraneToken() });
