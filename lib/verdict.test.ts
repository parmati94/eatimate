import { describe, expect, it } from "vitest";
import type { MealFacts } from "./compare";
import { NUTRIENT_FIELDS, type NutrientField, type Totals } from "./schema";
import { MEASURES, measureById, verdict, verdictSummary } from "./verdict";

function facts(t: Partial<Totals>, unknown: NutrientField[] = []): MealFacts {
  const totals = Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, 0])) as Totals;
  Object.assign(totals, t);
  return { totals, unknown: new Set(unknown), estimated: new Set() };
}

const names = ["Chipotle", "CAVA"];
const both = [true, true];

describe("verdict", () => {
  it("lower wins on calories, and says both figures", () => {
    const v = verdict(
      measureById("calories"),
      [facts({ calories: 780 }), facts({ calories: 640 })],
      names,
      both,
    );
    expect(v.kind).toBe("call");
    expect(v.sentence).toBe("CAVA has fewer calories: 640 cal against 780 at Chipotle.");
  });

  it("protein is per 100 calories and higher wins", () => {
    const v = verdict(
      measureById("protein"),
      [facts({ calories: 780, protein_g: 50 }), facts({ calories: 640, protein_g: 30 })],
      names,
      both,
    );
    expect(v.kind).toBe("call");
    expect(v.sentence).toBe(
      "Chipotle has more protein per calorie: 6.4 g per 100 cal against 4.7 at CAVA.",
    );
  });

  it("a tie is called on the displayed figure, not the float", () => {
    const v = verdict(
      measureById("sodium"),
      [facts({ sodium_mg: 1250.04 }), facts({ sodium_mg: 1249.96 })],
      names,
      both,
    );
    expect(v.kind).toBe("tie");
    expect(v.sentence).toBe("A tie on sodium: 1250 mg at both.");
  });

  it("an unpublished nutrient gets no call, and names the chain", () => {
    const v = verdict(
      measureById("sat_fat"),
      [facts({ sat_fat_g: 4 }, ["sat_fat_g"]), facts({ sat_fat_g: 9 })],
      names,
      both,
    );
    expect(v.kind).toBe("unpublished");
    expect(v.sentence).toMatch(/^Chipotle doesn’t publish saturated fat/);
  });

  it("an empty side is not a winner", () => {
    const v = verdict(
      measureById("calories"),
      [facts({ calories: 0 }), facts({ calories: 640 })],
      names,
      [false, true],
    );
    expect(v.kind).toBe("empty");
  });

  it("an unknown measure id falls back to the first", () => {
    expect(measureById("nope").id).toBe(MEASURES[0].id);
  });
});

describe("verdictSummary", () => {
  const a = facts({ calories: 780, protein_g: 50, sodium_mg: 1400, sat_fat_g: 9 });
  const b = facts({ calories: 640, protein_g: 30, sodium_mg: 1100, sat_fat_g: 4 });

  it("strings the calls together and keeps the chain names capitalised", () => {
    const s = verdictSummary([a, b], names, both, "Chicken bowl");
    expect(s).toBe(
      "For the same chicken bowl: CAVA has fewer calories: 640 cal against 780 at Chipotle; " +
        "Chipotle has more protein per calorie: 6.4 g per 100 cal against 4.7 at CAVA; " +
        "CAVA has less sodium: 1100 mg against 1400 at Chipotle; " +
        "CAVA has less saturated fat: 4 g against 9 at Chipotle. " +
        "It depends what you order: change either order on this page and the verdict moves.",
    );
  });

  it("leaves out what could not be decided", () => {
    const s = verdictSummary([facts({ calories: 500 }, ["sodium_mg"]), facts({ calories: 500 })], names, both);
    expect(s).toMatch(/^Neither Chipotle nor CAVA comes out ahead/);
  });
});
