import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { familiesOf, menuFamilies, reachableCount, roleChips, searchMenu } from "./search";
import { defaultSizeMode, mealLines, mealTotals } from "./meal";
import { ChainSchema, type Chain, type Component } from "./schema";

const ROOT = path.join(__dirname, "..");

async function chain(slug: string): Promise<Chain> {
  return ChainSchema.parse(
    JSON.parse(await fs.readFile(path.join(ROOT, "data", "chains", `${slug}.json`), "utf8")),
  );
}

async function slugs(): Promise<string[]> {
  const files = await fs.readdir(path.join(ROOT, "data", "chains"));
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

/** What the builder shows before anything is picked. */
function allVisible(c: Chain): Map<string, Component[]> {
  const m = new Map<string, Component[]>();
  const mode = defaultSizeMode(c)?.id;
  for (const comp of c.components) {
    if (comp.only_modes && !(mode && comp.only_modes.includes(mode))) continue;
    m.set(comp.category, [...(m.get(comp.category) ?? []), comp]);
  }
  return m;
}

const names = (r: { hits: { head: Component }[] }) => r.hits.map((h) => h.head.name);

describe("familiesOf", () => {
  it("collapses a size family into one row and drops add-ons", async () => {
    const c = await chain("sonic");
    const drinks = allVisible(c).get("drink")!;
    const fams = familiesOf(drinks);
    const coke = fams.find((f) => f.head.id === "coca-cola-small")!;
    expect(coke.members).toHaveLength(5);
    expect(fams.every((f) => !f.head.variant_of && !f.head.addon_of)).toBe(true);
  });
});

describe("searchMenu", () => {
  it("returns a family once, not once per size", async () => {
    const c = await chain("sonic");
    const found = searchMenu(menuFamilies(c, allVisible(c)), "coca-cola");
    expect(found.hits.filter((h) => h.head.name === "COCA-COLA®")).toHaveLength(1);
  });

  it("reads through the marks nobody types", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    expect(names(searchMenu(fams, "ched r bites"))).toContain("CHED 'R' BITES®");
    expect(names(searchMenu(fams, "barqs"))).toContain("BARQ’S® ROOT BEER");
  });

  it("matches a size label", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    expect(names(searchMenu(fams, "cherry rt 44"))).toContain("CHERRY ADD-IN");
  });

  it("matches a category name, behind the rows that match by name", async () => {
    const c = await chain("sonic");
    const found = searchMenu(menuFamilies(c, allVisible(c)), "snacks");
    // Everything filed under Snacks & Sides, and nothing named "snacks", so
    // the whole result is the category bucket.
    expect(found.hits.length).toBeGreaterThan(5);
    expect(found.hits.every((h) => h.cat.id === "sides")).toBe(true);
  });

  it("requires every term", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    expect(names(searchMenu(fams, "chili cheese tots"))).toEqual(["CHILI CHEESE TOTS"]);
  });

  it("counts matches on the other path instead of listing them", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    // The build path: everything except Sonic's published menu items.
    const build = new Set(
      c.categories.filter((x) => x.flow !== "preset").map((x) => x.id),
    );
    const found = searchMenu(fams, "cheeseburger", build);
    // Wacky Pack has one and is an extras category, so a hit here is right --
    // what must not happen is a menu item coming back while the build path is
    // on screen, because nothing would render it.
    expect(found.hits.every((h) => h.cat.flow !== "preset")).toBe(true);
    expect(found.elsewhere).toBeGreaterThan(0);
    expect(searchMenu(fams, "cheeseburger").hits.length).toBeGreaterThan(
      found.hits.length,
    );
  });

  it("finds nothing for an empty query", async () => {
    const c = await chain("sonic");
    expect(searchMenu(menuFamilies(c, allVisible(c)), "   ").hits).toHaveLength(0);
  });

  it("reaches every row on every chain", async () => {
    // The point of the field: typing a row's own name has to find that row,
    // whichever category it was filed under.
    for (const slug of await slugs()) {
      const c = await chain(slug);
      const fams = menuFamilies(c, allVisible(c));
      for (const f of fams) {
        const found = searchMenu(fams, f.head.name);
        expect(
          found.hits.some((h) => h.head.id === f.head.id),
          `${slug}: "${f.head.name}" does not find itself`,
        ).toBe(true);
      }
    }
  });
});

describe("roleChips", () => {
  it("prices each chip at what tapping it actually returns", async () => {
    // The gap is real: Subway files 18 rows under Protein and the word appears
    // in the serving text of every sandwich, so the honest number is not the
    // role tally.
    for (const slug of await slugs()) {
      const c = await chain(slug);
      const fams = menuFamilies(c, allVisible(c));
      const reach = new Set(c.categories.map((x) => x.id));
      for (const { word, count } of roleChips(fams, reach)) {
        expect(searchMenu(fams, word, reach).hits, `${slug}: ${word}`).toHaveLength(
          count,
        );
      }
    }
  });

  it("offers the customer's word, not the chain's heading", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    const reach = new Set(c.categories.map((x) => x.id));
    const words = roleChips(fams, reach).map((x) => x.word);
    expect(words).toContain("Drinks");
    // One word over four of Sonic's headings: Soft Drinks, Limeades & Slushes,
    // Teas, and Coffee. None of them is called "Drinks".
    expect(c.categories.some((x) => x.name === "Drinks")).toBe(false);
    expect(searchMenu(fams, "sweets", reach).hits.length).toBeGreaterThan(0);
  });

  it("never offers more chips than it has words for", async () => {
    const c = await chain("chipotle");
    const fams = menuFamilies(c, allVisible(c));
    const chips = roleChips(fams, new Set(c.categories.map((x) => x.id)));
    expect(chips.length).toBeLessThanOrEqual(4);
    expect(chips.every((x) => x.count > 0)).toBe(true);
  });
});

describe("reachableCount", () => {
  it("counts only what this path offers", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    const all = new Set(c.categories.map((x) => x.id));
    const build = new Set(
      c.categories.filter((x) => x.flow !== "preset").map((x) => x.id),
    );
    expect(reachableCount(fams, all)).toBe(211);
    expect(reachableCount(fams, build)).toBeLessThan(reachableCount(fams, all));
  });
});

describe("mealLines", () => {
  it("adds up to the label", async () => {
    const c = await chain("sonic");
    const sel = {
      "sonic-cheeseburger-with-ketchup-mayo": 1,
      "tots-medium": 1,
      "coca-cola-large": 1,
      "cherry-add-in-large": 1,
    };
    const lines = mealLines(c, sel);
    expect(lines).toHaveLength(4);
    const sum = lines.reduce((t, l) => t + l.calories, 0);
    expect(sum).toBe(mealTotals(c, sel).calories);
    expect(sum).toBe(1355);
  });

  it("carries the size mode and the portion into each line", async () => {
    const c = await chain("subway");
    const foot = (c.size_modes ?? []).find((m) => m.multipliers.protein === 2);
    if (!foot) return;
    const proteins = c.components.filter((x) => x.category === "protein");
    const sel = { [proteins[0].id]: 1 };
    const [line] = mealLines(c, sel, foot);
    expect(line.calories).toBe(proteins[0].calories * 2);
    expect(line.calories).toBe(mealTotals(c, sel, foot).calories);
  });
});
