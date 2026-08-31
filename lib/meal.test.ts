import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMeal, encodeMeal, mealTotals } from "./meal";
import { ChainSchema } from "./schema";

function chain(slug: string) {
  const raw = readFileSync(
    path.join(process.cwd(), "data", "chains", `${slug}.json`),
    "utf8",
  );
  return ChainSchema.parse(JSON.parse(raw));
}

const papajohns = chain("papajohns");
const cava = chain("cava");
const mode = (id: string) => papajohns.size_modes!.find((m) => m.id === id)!;

describe("meal links", () => {
  it("round-trips through the URL form", () => {
    const sel = { "cheese-original-large": 1, "pepperoni-original-large": 0.5 };
    expect(decodeMeal(encodeMeal(sel), papajohns)).toEqual(sel);
  });

  it("omits the quantity for a plain single serving", () => {
    expect(encodeMeal({ "cheese-original-large": 1 })).toBe(
      "cheese-original-large",
    );
  });

  it("drops ids the chain no longer has", () => {
    // Renaming an id (jalape-o-peppers -> jalapeno-peppers) must not throw or
    // resurrect a stale component; the rest of the link still works.
    const sel = decodeMeal("cheese-original-large,gone-forever", papajohns);
    expect(sel).toEqual({ "cheese-original-large": 1 });
  });

  it("drops quantities that are not on the step scale", () => {
    expect(decodeMeal("cheese-original-large:7.3", papajohns)).toEqual({});
    expect(decodeMeal("cheese-original-large:0", papajohns)).toEqual({});
  });
});

describe("mealTotals", () => {
  it("is empty for an empty meal", () => {
    expect(mealTotals(papajohns, {}).calories).toBe(0);
  });

  it("multiplies by the component quantity", () => {
    const one = mealTotals(papajohns, { "pepperoni-original-large": 1 });
    const two = mealTotals(papajohns, { "pepperoni-original-large": 2 });
    expect(two.calories).toBe(one.calories * 2);
  });

  it("scales portion categories by the slice count, and nothing else", () => {
    // The product behaviour: Papa John's publishes per slice, so eating the
    // whole 8-slice pizza is 8x the pizza -- but a side of garlic knots is not.
    const pizza = { "crust-original-large": 1, "cheese-original-large": 1 };
    const oneSlice = mealTotals(papajohns, pizza, mode("original-large"), 1);
    const wholePie = mealTotals(papajohns, pizza, mode("original-large"), 8);
    expect(wholePie.calories).toBe(oneSlice.calories * 8);

    const knots = { "garlic-knots": 1 };
    expect(mealTotals(papajohns, knots, mode("original-large"), 8).calories).toBe(
      mealTotals(papajohns, knots, mode("original-large"), 1).calories,
    );
  });

  it("ignores portion entirely for a chain with no portion block", () => {
    const sel = { [cava.components[0].id]: 1 };
    expect(mealTotals(cava, sel, null, 8).calories).toBe(
      mealTotals(cava, sel, null, 1).calories,
    );
  });

  it("sums every nutrient field, not just calories", () => {
    const t = mealTotals(papajohns, {
      "crust-original-large": 1,
      "cheese-original-large": 1,
    });
    expect(t.sodium_mg).toBeGreaterThan(0);
    expect(t.protein_g).toBeGreaterThan(0);
  });
});

describe("published data invariants", () => {
  it("never carries a negative nutrient", () => {
    for (const c of papajohns.components) {
      expect(c.calories, c.id).toBeGreaterThanOrEqual(0);
      expect(c.sodium_mg, c.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("records what was printed whenever a value was corrected", () => {
    for (const c of papajohns.components) {
      for (const fix of c.corrections ?? []) {
        expect(fix.reason.length, c.id).toBeGreaterThan(20);
        expect(fix.printed, c.id).not.toBe(fix.used);
      }
    }
  });
});
