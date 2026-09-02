import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildPath, modeOf, owedNote } from "./flow";
import { defaultSizeMode } from "./meal";
import { ChainSchema, type Chain, type Component } from "./schema";

const ROOT = path.join(__dirname, "..");

async function chain(slug: string): Promise<Chain> {
  return ChainSchema.parse(
    JSON.parse(await fs.readFile(path.join(ROOT, "data", "chains", `${slug}.json`), "utf8")),
  );
}

/** What the builder shows before anything is picked: every row that is not
 *  gated, plus the rows gated to the chain's default size mode. */
function allVisible(c: Chain): Map<string, Component[]> {
  const m = new Map<string, Component[]>();
  const mode = defaultSizeMode(c)?.id;
  for (const comp of c.components) {
    if (comp.only_modes && !(mode && comp.only_modes.includes(mode))) continue;
    m.set(comp.category, [...(m.get(comp.category) ?? []), comp]);
  }
  return m;
}

const ids = (cats: { id: string }[]) => cats.map((c) => c.id);

describe("modeOf", () => {
  it("reads the path off what is selected", async () => {
    const c = await chain("chopt");
    expect(modeOf(c, {})).toBeNull();
    expect(modeOf(c, { "kale-caesar": 1 })).toBe("menu");
    expect(modeOf(c, { romaine: 1 })).toBe("scratch");
  });
});

describe("buildPath on the menu path", () => {
  it("numbers only the menu item, and lists the rest as additive", async () => {
    const c = await chain("chopt");
    const p = buildPath(c, "menu", {}, allVisible(c));
    expect(ids(p.stepCats)).toEqual(["menu"]);
    expect(ids(p.addCats)).toEqual(["dressings"]);
    expect(p.owed).toBeNull();
    // Build-only categories become accordions under the same heading.
    expect(ids(p.extraCats)).toContain("greens");
    expect(ids(p.extraCats)).not.toContain("dressings");
  });

  it("promotes the owed category to a numbered step once a flagged item is picked", async () => {
    const c = await chain("chopt");
    const p = buildPath(c, "menu", { "kale-caesar": 1 }, allVisible(c));
    expect(ids(p.stepCats)).toEqual(["menu", "dressings"]);
    expect(ids(p.addCats)).toEqual([]);
    expect(p.owed?.by.id).toBe("kale-caesar");
    expect(owedNote(c, p.owed!)).toMatch(/^Chopt lists the Kale Caesar as "1 salad, no dressing"\./);
  });

  it("leaves a wrap alone, because its sauce is in the published figure", async () => {
    const c = await chain("chopt");
    const p = buildPath(c, "menu", { "chicken-club-wrap": 1 }, allVisible(c));
    expect(ids(p.stepCats)).toEqual(["menu"]);
    expect(p.owed).toBeNull();
  });

  it("numbers a `both` category placed before the menu item", async () => {
    // Potbelly's bread is picked before the sandwich because a sandwich has no
    // size until you pick one; its toppings come after and are extra.
    const c = await chain("potbelly");
    const p = buildPath(c, "menu", {}, allVisible(c));
    expect(ids(p.stepCats)).toEqual(["bread", "item"]);
    expect(ids(p.addCats)).toEqual(["toppings", "premium"]);
  });

  it("does not offer what a named item already includes", async () => {
    const c = await chain("jimmyjohns");
    const p = buildPath(c, "menu", {}, allVisible(c));
    const inPreset = c.categories.filter((x) => x.in_preset).map((x) => x.id);
    expect(inPreset.length).toBeGreaterThan(0);
    for (const id of inPreset) expect(ids(p.extraCats)).not.toContain(id);
  });
});

describe("buildPath on the build path", () => {
  it("numbers every build and both category, in config order", async () => {
    const c = await chain("subway");
    const p = buildPath(c, "scratch", {}, allVisible(c));
    const expected = c.categories
      .filter((x) => (x.flow ?? "build") === "build" || x.flow === "both")
      .map((x) => x.id);
    expect(ids(p.stepCats)).toEqual(expected);
    expect(p.addCats).toEqual([]);
    expect(p.owed).toBeNull();
  });

  it("ignores the mode on a chain with no menu path", async () => {
    const c = await chain("chipotle");
    const vis = allVisible(c);
    expect(ids(buildPath(c, null, {}, vis).stepCats)).toEqual(ids(buildPath(c, "menu", {}, vis).stepCats));
    expect(buildPath(c, null, {}, vis).hasPresets).toBe(false);
  });

  it("shows nothing numbered while a preset chain is still asking how to start", async () => {
    const c = await chain("potbelly");
    expect(buildPath(c, null, {}, allVisible(c)).stepCats).toEqual([]);
  });
});
