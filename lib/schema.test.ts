import { describe, expect, it } from "vitest";
import nutrients from "./nutrients.json";
import { NUTRIENT_FIELDS, NUTRIENT_LABELS, NUTRIENT_UNITS } from "./schema";

describe("lib/nutrients.json", () => {
  it("is the same list the schema carries", () => {
    // The Python ingest reads the JSON; the TypeScript side keeps literal
    // constants so NutrientField stays a union type. This is the seam: the
    // two cannot drift without a red build.
    expect(nutrients.fields.map((n) => n.field)).toEqual([...NUTRIENT_FIELDS]);
    for (const n of nutrients.fields) {
      expect(NUTRIENT_LABELS[n.field as keyof typeof NUTRIENT_LABELS]).toBe(n.label);
      expect(NUTRIENT_UNITS[n.field as keyof typeof NUTRIENT_UNITS]).toBe(n.unit);
    }
  });
});
