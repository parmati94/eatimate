import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { compareRows, MealsSchema, pairSlug, parsePair, type BuiltMeal } from "./meals";
import { emptyTotals } from "./meal";
import { ChainSchema } from "./schema";

const ROOT = path.join(__dirname, "..");

async function dishes() {
  const raw = await fs.readFile(path.join(ROOT, "data", "meals.json"), "utf8");
  return MealsSchema.parse(JSON.parse(raw)).dishes;
}

describe("data/meals.json", () => {
  it("builds a meal that one path can actually show", async () => {
    // modeOf picks the path from the selections, so a build that mixes a
    // preset-only category with a build-only one has no path that renders all
    // of it: the missing half still counts toward the total, and the card
    // reports calories for something nothing on screen says was chosen.
    for (const dish of await dishes()) {
      for (const build of dish.builds) {
        const chain = ChainSchema.parse(
          JSON.parse(
            await fs.readFile(
              path.join(ROOT, "data", "chains", `${build.chain}.json`),
              "utf8",
            ),
          ),
        );
        const flow = new Map(chain.categories.map((c) => [c.id, c.flow ?? "build"]));
        const flows = new Set(
          chain.components
            .filter((c) => build.items.includes(c.id))
            .map((c) => flow.get(c.category)),
        );
        expect(
          flows.has("preset") && flows.has("build"),
          `${dish.id}/${build.chain} needs both paths at once`,
        ).toBe(false);
      }
    }
  });

  it("names only components the chains still publish", async () => {
    // The whole feature rests on hand-written component ids, so this is the
    // one thing that can rot silently: a chain drops an item, and a comparison
    // page goes on comparing a bowl that no longer has chicken in it.
    for (const dish of await dishes()) {
      for (const build of dish.builds) {
        const raw = await fs.readFile(
          path.join(ROOT, "data", "chains", `${build.chain}.json`),
          "utf8",
        );
        const chain = ChainSchema.parse(JSON.parse(raw));
        const ids = new Set(chain.components.map((c) => c.id));
        for (const item of build.items) {
          const id = item.split(":")[0];
          expect(ids, `${dish.id} / ${build.chain}`).toContain(id);
        }
      }
    }
  });

  it("builds one dish per chain, so a pair is never ambiguous", async () => {
    for (const dish of await dishes()) {
      const slugs = dish.builds.map((b) => b.chain);
      expect(new Set(slugs).size, dish.id).toBe(slugs.length);
    }
  });
});

describe("pair slugs", () => {
  it("is alphabetical whichever way round it is asked", () => {
    expect(pairSlug("chipotle", "cava")).toBe("cava-vs-chipotle");
    expect(pairSlug("cava", "chipotle")).toBe("cava-vs-chipotle");
  });

  it("rejects a slug that is not two different chains", () => {
    expect(parsePair("cava-vs-chipotle")).toEqual(["cava", "chipotle"]);
    expect(parsePair("cava")).toBeNull();
    expect(parsePair("cava-vs-cava")).toBeNull();
    expect(parsePair("a-vs-b-vs-c")).toBeNull();
  });
});

describe("compareRows", () => {
  const meal = (
    totals: Partial<Record<string, number>>,
    unknown: string[] = [],
    estimated: string[] = [],
  ) =>
    ({
      totals: { ...emptyTotals(), ...totals },
      unknown: new Set(unknown),
      estimated: new Set(estimated),
    }) as unknown as BuiltMeal;

  it("names the higher side and the gap", () => {
    const rows = compareRows([meal({ protein_g: 40 }), meal({ protein_g: 50 })]);
    const p = rows.find((r) => r.field === "protein_g")!;
    expect(p.highest).toBe(1);
    expect(p.spread).toBe(10);
  });

  it("reports a tie as a zero gap, not as uncomparable", () => {
    const p = compareRows([meal({ protein_g: 40 }), meal({ protein_g: 40 })]).find(
      (r) => r.field === "protein_g",
    )!;
    expect(p.highest).toBeNull();
    expect(p.spread).toBe(0);
  });

  it("refuses to compare a nutrient one chain does not publish", () => {
    // Chipotle publishes no cholesterol for its newer proteins. Treating the
    // absence as zero would hand it the win on a number nobody measured.
    const rows = compareRows([
      meal({ cholesterol_mg: 0 }, ["cholesterol_mg"]),
      meal({ cholesterol_mg: 95 }),
    ]);
    const c = rows.find((r) => r.field === "cholesterol_mg")!;
    expect(c.values[0]).toBeNull();
    expect(c.highest).toBeNull();
    expect(c.spread).toBeNull();
  });

  it("carries the estimate flag through to the row", () => {
    const rows = compareRows([
      meal({ cholesterol_mg: 145 }, [], ["cholesterol_mg"]),
      meal({ cholesterol_mg: 95 }),
    ]);
    const c = rows.find((r) => r.field === "cholesterol_mg")!;
    expect(c.approx).toEqual([true, false]);
  });
});
