import { describe, expect, it } from "vitest";
import { pctDV, show } from "./rounding";

describe("show", () => {
  it("leaves a published value alone", () => {
    // The values we hold are already each chain's published figures, so
    // displaying one must not change it.
    expect(show(190)).toBe(190);
    expect(show(5)).toBe(5);
    expect(show(4.5, 1)).toBe(4.5);
  });

  it("keeps a total as the exact sum, not an FDA increment", () => {
    // The bug this replaced: a 5-calorie sauce on a 190-calorie crust rounded
    // to 200, so adding a 5 appeared to add 10.
    expect(show(190 + 5)).toBe(195);
    expect(show(195 * 3)).toBe(585);
  });

  it("strips binary noise from summed grams", () => {
    expect(show(4.5 + 0.5 + 7.8, 1)).toBe(12.8);
    expect(show(0.1 + 0.2, 1)).toBe(0.3);
  });

  it("drops a trailing zero rather than printing 7.0", () => {
    expect(show(7, 1)).toBe(7);
  });

  it("rounds to whole numbers by default", () => {
    expect(show(12.4)).toBe(12);
    expect(show(12.5)).toBe(13);
  });
});

describe("pctDV", () => {
  it("uses the raw value, not a rounded one", () => {
    expect(pctDV("sodium_mg", 2300)).toBe(100);
    expect(pctDV("fat_g", 39)).toBe(50);
  });

  it("is zero for nothing", () => {
    expect(pctDV("carbs_g", 0)).toBe(0);
  });
});
