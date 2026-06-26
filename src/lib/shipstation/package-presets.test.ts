import { describe, expect, it } from "vitest";

import { buildPackagePresetInput } from "./package-preset-input";

describe("buildPackagePresetInput", () => {
  it("builds a stable ShipStation custom package payload from a Monday package row", () => {
    const input = buildPackagePresetInput({
      label: "Standard 12x10x8 carton",
      length: 12.12345,
      width: 10,
      height: 8.98765,
      cost: 1.23,
      normalizedKey: "12.123x10.000x8.988",
      sourceRowNumber: 123456789,
    });

    expect(input).toEqual({
      package_code: "custom_pkg_123456789",
      name: "Standard 12x10x8 carton",
      dimensions: {
        unit: "inch",
        length: 12.123,
        width: 10,
        height: 8.988,
      },
      description: "Synced from Monday package board item 123456789.",
    });
  });

  it("truncates package names to ShipStation's 50-character limit", () => {
    const input = buildPackagePresetInput({
      label: "Very long package preset name that exceeds the ShipStation limit",
      length: 1,
      width: 2,
      height: 3,
      cost: 4,
      normalizedKey: "1.000x2.000x3.000",
      sourceRowNumber: 42,
    });

    expect(input.name).toBe(
      "Very long package preset name that exceeds the Shi",
    );
    expect(input.name).toHaveLength(50);
  });
});
