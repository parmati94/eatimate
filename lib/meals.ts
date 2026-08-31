// Cross-chain comparison.
//
// Two chains never sell the same thing, so nothing in the nutrition data can
// say that CAVA's grilled chicken "is" Chipotle's chicken. That judgement is
// made by hand, once, in data/meals.json: a *dish* is a rule written in
// English, and a *build* is one chain's cheapest honest reading of that rule,
// spelled as component ids the chain actually publishes.
//
// The rule is the load-bearing part. Without it a comparison page is two
// unrelated bowls with a subtraction between them.
import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { z } from "zod";
import { compareRows, pairSlug, type CompareRow, type MealFacts } from "./compare";
import { getChain } from "./data";
import { decodeMeal, encodeMeal, estimatedNutrients, mealTotals, unknownNutrients, Selections } from "./meal";
import { Chain, Component, NutrientField, Totals } from "./schema";

export const BuildSchema = z
  .object({
    chain: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    // What you would say at the counter. Not necessarily a menu item — most of
    // these are build-your-own — but it has to be orderable as written.
    name: z.string().min(1),
    // Component ids in the same grammar as the ?m= share link, so a build is
    // also a one-click handoff into that chain's builder.
    items: z.array(z.string().min(1)).min(1),
    mode: z.string().optional(),
    portion: z.number().positive().optional(),
  })
  .strict();

export const DishSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    rule: z.string().min(1),
    builds: z.array(BuildSchema).min(2),
  })
  .strict();

export const MealsSchema = z.object({ dishes: z.array(DishSchema).min(1) }).strict();

export type Build = z.infer<typeof BuildSchema>;
export type Dish = z.infer<typeof DishSchema>;

const MEALS_FILE = path.join(process.cwd(), "data", "meals.json");

export const listDishes = cache(async (): Promise<Dish[]> => {
  try {
    return MealsSchema.parse(JSON.parse(await fs.readFile(MEALS_FILE, "utf8"))).dishes;
  } catch (e) {
    console.error("data/meals.json failed validation; no comparisons served:", e);
    return [];
  }
});

/** One chain's build, resolved against that chain's live component list. */
export interface BuiltMeal extends MealFacts {
  chain: Chain;
  build: Build;
  items: Component[];
  selections: Selections;
  totals: Totals;
  unknown: Set<NutrientField>;
  estimated: Set<NutrientField>;
  /** Deep link into the chain's own builder with this meal preloaded. */
  href: string;
}

/**
 * Resolve a build, or null if the chain dropped an item it names.
 *
 * Dropping the whole build is deliberate. decodeMeal silently ignores ids it
 * no longer recognises, which is right for a stale share link a stranger
 * pasted — they still get most of their meal. It is wrong here: a chicken bowl
 * quietly losing its chicken would go on being compared, and the page would
 * state a protein figure for a bowl of rice.
 */
export async function buildMeal(build: Build): Promise<BuiltMeal | null> {
  const chain = await getChain(build.chain);
  if (!chain) return null;
  const selections = decodeMeal(build.items.join(","), chain);
  if (Object.keys(selections).length !== build.items.length) return null;

  const mode = build.mode
    ? (chain.size_modes ?? []).find((m) => m.id === build.mode)
    : (chain.size_modes ?? []).find((m) => m.default);
  if (build.mode && !mode) return null;

  const byId = new Map(chain.components.map((c) => [c.id, c]));
  return {
    chain,
    build,
    items: build.items.map((i) => byId.get(i.split(":")[0])!),
    selections,
    totals: mealTotals(chain, selections, mode, build.portion ?? 1),
    unknown: unknownNutrients(chain, selections),
    estimated: estimatedNutrients(chain, selections),
    href: `/${chain.slug}?m=${encodeMeal(selections)}`,
  };
}


/** Every unordered chain pair sharing at least one dish. */
export async function listPairs(): Promise<[string, string][]> {
  const seen = new Map<string, [string, string]>();
  for (const dish of await listDishes()) {
    const slugs = dish.builds.map((b) => b.chain);
    for (const a of slugs) {
      for (const b of slugs) {
        if (a >= b) continue;
        seen.set(pairSlug(a, b), [a, b]);
      }
    }
  }
  return [...seen.values()];
}

/** A comparison that exists, resolved for linking to it. */
export interface ComparePair {
  slug: string;
  chains: [Chain, Chain];
  /** Dish names this pair compares, for the card's subtitle. */
  dishes: string[];
}

/**
 * Every comparison the data supports, alphabetical within a pair and sorted by
 * name. Drives the /compare index, the homepage section and the chain-page
 * strip, so all three agree on what exists.
 */
export const listComparePairs = cache(async (): Promise<ComparePair[]> => {
  const out: ComparePair[] = [];
  for (const [a, b] of await listPairs()) {
    const chains = await Promise.all([getChain(a), getChain(b)]);
    if (chains.some((c) => c === null)) continue;
    const dishes = (await listDishes())
      .filter((d) => [a, b].every((s) => d.builds.some((x) => x.chain === s)))
      .map((d) => d.name);
    if (!dishes.length) continue;
    out.push({ slug: pairSlug(a, b), chains: chains as [Chain, Chain], dishes });
  }
  return out.sort((x, y) =>
    x.chains[0].name.localeCompare(y.chains[0].name) ||
    x.chains[1].name.localeCompare(y.chains[1].name),
  );
});

/** The comparisons one chain takes part in, for its page's compare strip. */
export async function pairsWith(slug: string): Promise<ComparePair[]> {
  return (await listComparePairs()).filter((p) =>
    p.chains.some((c) => c.slug === slug),
  );
}

/** The dishes both chains build, resolved, in data order. */
export async function pairDishes(a: string, b: string) {
  const out = [];
  for (const dish of await listDishes()) {
    const ba = dish.builds.find((x) => x.chain === a);
    const bb = dish.builds.find((x) => x.chain === b);
    if (!ba || !bb) continue;
    const meals = await Promise.all([buildMeal(ba), buildMeal(bb)]);
    if (meals.some((m) => m === null)) continue;
    const built = meals as BuiltMeal[];
    out.push({ dish, meals: built, rows: compareRows(built) });
  }
  return out;
}

export { compareRows, pairSlug, parsePair } from "./compare";
export type { CompareRow, MealFacts } from "./compare";
