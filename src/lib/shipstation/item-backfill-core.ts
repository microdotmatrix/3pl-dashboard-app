import { getUnitsPickedFromRawShipment } from "@/lib/billing/units-picked";

export type ShipmentItemBackfillCandidate = {
  id: string;
  externalId: string;
  raw?: unknown;
};

export type ShipmentItemBackfillResult = {
  scanned: number;
  /** Every shipment matching the filters, including those beyond this batch. */
  totalCandidates: number;
  repaired: number;
  failed: number;
  /** Still missing items once this batch finished; > 0 means run it again. */
  remaining: number;
  errors: Array<{ externalId: string; message: string }>;
};

export const backfillShipmentItems = async ({
  candidates,
  totalCandidates = candidates.length,
  apply,
  fetchShipment,
  persistShipment,
}: {
  candidates: ShipmentItemBackfillCandidate[];
  totalCandidates?: number;
  apply: boolean;
  fetchShipment: (externalId: string) => Promise<unknown>;
  persistShipment: (
    candidate: ShipmentItemBackfillCandidate,
    shipment: unknown,
  ) => Promise<void>;
}): Promise<ShipmentItemBackfillResult> => {
  const result: ShipmentItemBackfillResult = {
    scanned: candidates.length,
    totalCandidates,
    repaired: 0,
    failed: 0,
    remaining: totalCandidates,
    errors: [],
  };

  if (!apply) {
    return result;
  }

  for (const candidate of candidates) {
    try {
      const shipment = await fetchShipment(candidate.externalId);
      if (getUnitsPickedFromRawShipment(shipment) === null) {
        throw new Error("ShipStation response is missing items.");
      }

      await persistShipment(candidate, shipment);
      result.repaired += 1;
      result.remaining -= 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        externalId: candidate.externalId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
};
