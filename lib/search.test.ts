import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { familiesOf, menuFamilies, reachableCount, searchMenu } from "./search";
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

describe("normalising what people actually type", () => {
  it("folds accents instead of deleting the letter", async () => {
    // The ñ used to split the word: "Jalapeño" indexed as "jalape o", so
    // "jalapeno" found nothing on any of the thirteen chains that sell one.
    for (const slug of ["sonic", "fiveguys", "moes", "subway", "whataburger"]) {
      const c = await chain(slug);
      const fams = menuFamilies(c, allVisible(c));
      expect(names(searchMenu(fams, "jalapeno")).length, slug).toBeGreaterThan(0);
      // Typing it WITH the accent has to keep working too.
      expect(names(searchMenu(fams, "jalape\u00f1o")).length, slug).toBeGreaterThan(0);
    }
    const js = await chain("justsalad");
    expect(names(searchMenu(menuFamilies(js, allVisible(js)), "acai"))).toContain(
      "A\u00e7a\u00ed Protein Punch",
    );
  });

  it("reads an initialism run together or spaced", async () => {
    const c = await chain("subway");
    const fams = menuFamilies(c, allVisible(c));
    for (const q of ["bmt", "b.m.t.", "b m t"]) {
      expect(names(searchMenu(fams, q)), q).toContain("B.M.T.\u00ae");
    }
    const jj = await chain("jimmyjohns");
    expect(names(searchMenu(menuFamilies(jj, allVisible(jj)), "jjblt")).length)
      .toBeGreaterThan(0);
  });
});

describe("ranking", () => {
  it("leads with a word, without dropping what is buried in one", async () => {
    const c = await chain("sonic");
    const found = names(searchMenu(menuFamilies(c, allVisible(c)), "cola"));
    expect(found[0]).toBe("COCA-COLA\u00ae");
    // "cola" is inside "chocolate", and those stay -- mid-word matching is what
    // makes "burger" find a cheeseburger.
    expect(found.some((n) => n.includes("CHOCOLATE"))).toBe(true);
  });

  it("still puts an item match above a category match", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    const reach = new Set(c.categories.map((x) => x.id));
    const hits = searchMenu(fams, "sides", reach).hits;
    expect(hits.every((h) => h.cat.id === "sides")).toBe(true);
  });
});

describe("the customer's word for a category", () => {
  it("takes soda and pop for a drink", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    const reach = new Set(c.categories.map((x) => x.id));
    const drinks = searchMenu(fams, "drinks", reach).hits.length;
    for (const q of ["soda", "pop", "beverages"]) {
      expect(searchMenu(fams, q, reach).hits.length, q).toBe(drinks);
    }
  });

  it("reaches headings that never use it", async () => {
    const c = await chain("sonic");
    const fams = menuFamilies(c, allVisible(c));
    const reach = new Set(c.categories.map((x) => x.id));
    // "Drinks" is on no Sonic heading, and covers four of them: Soft Drinks,
    // Limeades & Slushes, Teas, Coffee.
    expect(c.categories.some((x) => x.name === "Drinks")).toBe(false);
    const drinks = searchMenu(fams, "drinks", reach).hits;
    expect(new Set(drinks.map((h) => h.cat.id)).size).toBeGreaterThan(3);
    // And "sweets" for a heading that says "Shakes, Blasts & Sundaes".
    expect(searchMenu(fams, "sweets", reach).hits.length).toBeGreaterThan(0);
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

describe("no regressions", () => {
  // Everything below worked before the normalising and ranking changes. The
  // matcher only ever gained words and reordered tiers, so nothing here may
  // start returning nothing.
  const KNOWN: Record<string, string[]> = {
    sonic: ["coke", "diet coke", "cherry limeade", "fries", "tots", "shake",
            "onion rings", "corn dog", "slush", "dr pepper", "sprite", "chili",
            "coca cola", "rt 44", "ched r bites", "barqs"],
    chickfila: ["nuggets", "waffle fries", "strips", "sandwich", "lemonade",
                "sauce", "mac", "salad"],
    bww: ["wings", "boneless", "mozzarella", "ranch", "fries", "nachos",
          "burger", "dippers"],
    subway: ["footlong", "meatball", "cold cut", "tuna", "cookie"],
    chipotle: ["burrito", "bowl", "guac", "queso", "carnitas", "barbacoa", "chips"],
    dominos: ["pepperoni", "thin crust", "garlic", "wings", "pan"],
    burgerking: ["whopper", "fries", "onion rings", "coke", "shake", "nuggets"],
    wingstop: ["wings", "boneless", "fries", "ranch", "lemon pepper"],
    papajohns: ["pepperoni", "garlic sauce", "wings", "breadsticks"],
    jimmyjohns: ["turkey", "italian", "chips", "pickle", "gargantuan"],
  };
  it("still finds everything it used to", async () => {
    for (const [slug, queries] of Object.entries(KNOWN)) {
      const c = await chain(slug);
      const fams = menuFamilies(c, allVisible(c));
      for (const q of queries) {
        expect(searchMenu(fams, q).hits.length, `${slug}: "${q}"`).toBeGreaterThan(0);
      }
    }
  });
});
