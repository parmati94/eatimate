import { promises as fs } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { ChainSchema, type Chain, type Component } from "./schema";

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "chains");

/**
 * Consistency between chains that sell the same kind of food.
 *
 * Two sandwich chains offering "start from a menu item" and a third not
 * offering it is a bug, but it is invisible: every page looks fine on its own,
 * and it only shows up when someone compares two of them side by side. Subway
 * shipped that way and went unnoticed until Paul went looking. That does not
 * scale past seventeen chains, so it is a test rather than a habit.
 *
 * A chain may always differ -- Chipotle publishes no whole-item nutrition, so
 * it cannot have a preset path. It just has to SAY so, in meta.consistency,
 * with the reason. Undeclared drift fails; declared difference passes.
 */
async function chains(): Promise<Chain[]> {
  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) =>
      ChainSchema.parse(JSON.parse(await fs.readFile(path.join(DIR, f), "utf8"))),
    ),
  );
}

const flowOf = (c: Chain, id: string) =>
  c.categories.find((x) => x.id === id)?.flow ?? "build";

const hasPresets = (c: Chain) =>
  c.categories.some((cat) => cat.flow === "preset");

/** Categories that are a side, a drink or a pudding rather than the meal. */
const SIDE_WORDS =
  /drink|beverage|shake|dessert|treat|side|chip|cookie|soup|fries|sauce|dip|topping|extra/i;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Categories filed as `extras` whose rows are whole meals. */
function mealsFiledAsExtras(c: Chain): string[] {
  const out: string[] = [];
  for (const cat of c.categories) {
    if (flowOf(c, cat.id) !== "extras") continue;
    if (SIDE_WORDS.test(cat.name)) continue;
    const rows = c.components.filter((x: Component) => x.category === cat.id);
    if (rows.length >= 5 && median(rows.map((r) => r.calories)) >= 300) {
      out.push(cat.id);
    }
  }
  return out;
}

describe("cross-chain consistency", () => {
  it("offers a preset path wherever a cuisine peer does", async () => {
    const all = await chains();
    const byGlyph = new Map<string, Chain[]>();
    for (const c of all) {
      if (!c.glyph) continue;
      byGlyph.set(c.glyph, [...(byGlyph.get(c.glyph) ?? []), c]);
    }
    const missing: string[] = [];
    for (const [glyph, peers] of byGlyph) {
      if (peers.length < 2 || !peers.some(hasPresets)) continue;
      for (const c of peers) {
        if (hasPresets(c) || c.consistency?.no_presets) continue;
        missing.push(
          `${c.slug} sells ${glyph} like ${peers
            .filter((p) => hasPresets(p))
            .map((p) => p.slug)
            .join(", ")}, which offer "start from a menu item", but it does not. ` +
            `Give it one, or add meta.consistency.no_presets explaining why it cannot.`,
        );
      }
    }
    expect(missing).toEqual([]);
  });

  it("does not bury whole menu items under `extras`", async () => {
    // `extras` renders at the bottom under "Sides, drinks & other menu items".
    // A category of 500-calorie sandwiches does not belong there; that is where
    // Subway's entire named menu was sitting.
    const bad: string[] = [];
    for (const c of await chains()) {
      for (const cat of mealsFiledAsExtras(c)) {
        if (c.consistency?.[`extras_${cat}`]) continue;
        bad.push(
          `${c.slug}.${cat} is flow:"extras" but its rows are whole meals. ` +
            `Make it a preset, or add meta.consistency.extras_${cat} with the reason.`,
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("does not offer, on the menu path, what a menu item already includes", async () => {
    // A `build` category shows on BOTH paths: a numbered step when building
    // from scratch, and under "Add to it" when starting from a menu item. For
    // an ingredient that is right -- extra cheese is a real order. For a
    // STRUCTURAL choice it is not: Jimmy John's offered a second loaf under a
    // sandwich whose bread was picked in step 1, and its own category note
    // said "A named sandwich already includes it".
    //
    // Single-select is the signal, not the rule: you get exactly one bun, one
    // size, one bread, and a preset already decided which. Flagging it demands
    // `in_preset` or a waiver, so the next chain cannot quietly reintroduce it.
    const bad: string[] = [];
    for (const c of await chains()) {
      if (!hasPresets(c)) continue;
      for (const cat of c.categories) {
        if ((cat.flow ?? "build") !== "build") continue;
        if (cat.select !== "single" || cat.in_preset) continue;
        if (c.consistency?.[`menu_${cat.id}`]) continue;
        bad.push(
          `${c.slug}.${cat.id} is a single choice offered on the menu path, ` +
            `where the menu item already has one. Mark it in_preset, or add ` +
            `meta.consistency.menu_${cat.id} with the reason it belongs there.`,
        );
      }
    }
    expect(bad).toEqual([]);
  });

  it("gives every chain the fields a tile and a comparison need", async () => {
    const bad: string[] = [];
    for (const c of await chains()) {
      if (!c.glyph) bad.push(`${c.slug}: no glyph (homepage tile falls back to grey)`);
      if (!c.formats?.length) bad.push(`${c.slug}: no formats (tile has nothing to say)`);
      if (!c.blurb) bad.push(`${c.slug}: no blurb (meta description falls back)`);
    }
    expect(bad).toEqual([]);
  });
});
