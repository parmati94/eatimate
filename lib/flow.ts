// Which categories are steps, which are additive, and which path a meal is on.
//
// Pulled out of MealBuilder because this is the most-edited logic on the site
// (Potbelly's bread before the sandwich, the menu-path split, the step a salad
// owes for its dressing) and it lived inside an 855-line client component
// where the only way to check a change was to click through three chains in
// a browser. Everything here is pure: same chain and selections in, same
// path out, so lib/flow.test.ts can run it over the real chain files.
import type { Selections } from "./meal";
import type { Category, Chain, Component } from "./schema";

export type Mode = "menu" | "scratch";

/** The path a chain opens on when nothing has chosen one yet. */
export function defaultMode(chain: Chain): Mode | null {
  return chain.default_flow === "build"
    ? "scratch"
    : chain.default_flow === "menu"
      ? "menu"
      : null;
}

/**
 * Which path a ready-made set of selections belongs to.
 *
 * A comparison preloads a build, and a shared ?m= link restores one, but
 * neither carried a mode -- so a chain that asks "how do you want to start?"
 * showed that question with the meal already selected behind it and the
 * total already counting it. If anything picked is preset-only, the meal came
 * off the menu; otherwise it was built.
 */
export function modeOf(chain: Chain, sel: Selections): Mode | null {
  if (!Object.keys(sel).length) return null;
  const flow = new Map(chain.categories.map((c) => [c.id, c.flow ?? "build"]));
  return chain.components.some((c) => sel[c.id] && flow.get(c.category) === "preset")
    ? "menu"
    : "scratch";
}

/** The two mutually exclusive paths, limited to categories with something to show. */
export function splitCats(chain: Chain, visible: Map<string, Component[]>) {
  // On a "name and tweak" chain the two paths are mutually exclusive: you
  // either start from a published menu item OR compose one from parts.
  // Stacking them in one numbered flow reads as building a second sandwich.
  const presetCats = chain.categories.filter(
    (c) => (c.flow === "preset" || c.flow === "both") && visible.has(c.id),
  );
  const scratchCats = chain.categories.filter(
    (c) => ((c.flow ?? "build") === "build" || c.flow === "both") && visible.has(c.id),
  );
  return { presetCats, scratchCats, hasPresets: presetCats.length > 0 };
}

export interface BuildPath {
  presetCats: Category[];
  scratchCats: Category[];
  hasPresets: boolean;
  /** The categories of the path in effect, in config order. */
  buildCats: Category[];
  /** The numbered steps you owe. */
  stepCats: Category[];
  /** Promoted categories that are only ever additive once a menu item is picked. */
  addCats: Category[];
  /** Accordions under the same heading: the build categories a menu path does
   *  not number, plus the chain's `extras`. */
  extraCats: Category[];
  /** A menu item the chain publishes as incomplete, and the step it owes. */
  owed: { by: Component; cat: Category } | null;
}

export function buildPath(
  chain: Chain,
  mode: Mode | null,
  selections: Selections,
  visible: Map<string, Component[]>,
): BuildPath {
  const { presetCats, scratchCats, hasPresets } = splitCats(chain, visible);
  const buildCats = !hasPresets
    ? scratchCats
    : mode === "menu"
      ? presetCats
      : mode === "scratch"
        ? scratchCats
        : [];

  // On the menu path, where the numbered run stops being a sequence of choices
  // and becomes a list of things you may add.
  //
  // Everything AFTER the last `preset` category is additive: Potbelly's bread
  // is `both` and comes first because a sandwich has no size until you pick
  // one, but its toppings come after the sandwich and are extra. Without the
  // break, "2 Protein" under a chosen B.M.T. reads as "now choose your meat",
  // which is the opposite of what starting from a menu item means.
  const lastPreset = buildCats.map((c) => c.flow).lastIndexOf("preset");
  const splitAt = mode === "menu" && lastPreset >= 0 ? lastPreset + 1 : buildCats.length;
  let stepCats = buildCats.slice(0, splitAt);
  let addCats = buildCats.slice(splitAt);

  // A menu item the chain publishes as INCOMPLETE owes one more step. Chopt
  // and Just Salad both state that a named salad's figures carry no dressing,
  // so with one picked, dressing is not something you may add but something
  // the chain says is missing -- and the numbering has to say so too, because
  // a row note reading "no dressing" under a flow that ends at step 1 is a
  // caption nobody reads on the way to the total.
  //
  // Keyed off the PICK, not the chain: step 1 here is a mixed list, and a
  // wrap or sandwich from the same chart includes its sauce. Before a pick,
  // or with a wrap picked, nothing moves.
  let owed: BuildPath["owed"] = null;
  if (mode === "menu") {
    const by = chain.components.find((c) => selections[c.id] && c.needs);
    const cat = by ? addCats.find((c) => c.id === by.needs) : undefined;
    if (by && cat) {
      owed = { by, cat };
      stepCats = [...stepCats, cat];
      addCats = addCats.filter((c) => c !== cat);
    }
  }

  // Started from a menu item? Everything else becomes something you can add.
  // Which of those are "already in it" is not published, so the page shows the
  // full list and says so, rather than us guessing on the customer's behalf.
  // The build steps become "add to it" -- except the "both" ones, which are
  // already numbered steps of this path, and the `in_preset` ones, which a
  // named item already comes with.
  const plainExtras = chain.categories.filter(
    (c) => c.flow === "extras" && visible.has(c.id),
  );
  const extraCats =
    mode === "menu"
      ? [...scratchCats.filter((c) => c.flow !== "both" && !c.in_preset), ...plainExtras]
      : plainExtras;

  return { presetCats, scratchCats, hasPresets, buildCats, stepCats, addCats, extraCats, owed };
}

/**
 * Whether a numbered step has been answered.
 *
 * "Make it a meal" attaches to a meal, and on the menu path a meal is a menu
 * item -- but the shelf used to appear on ANY selection, so picking a dipping
 * sauce from an accordion, or a cherry add-in from a search result, offered to
 * turn it into a meal. The steps are exactly the categories the path numbers,
 * which on the menu path is the published item and nothing else, so the
 * question "has this order got something to build on" is already answered by
 * the structure.
 */
export function mealStarted(
  chain: Chain,
  selections: Selections,
  stepCats: Category[],
): boolean {
  const steps = new Set(stepCats.map((c) => c.id));
  return chain.components.some((c) => selections[c.id] && steps.has(c.category));
}

/** The line under an owed step: the chain's own words, not a paraphrase.
 *  Subway's is "no dressing unless noted", and "unless noted" is load-bearing. */
export function owedNote(chain: Chain, owed: NonNullable<BuildPath["owed"]>): string {
  return [
    `${chain.name} lists the ${owed.by.name} as "${owed.by.serving_desc}". Add one here to count it.`,
    owed.cat.note,
  ]
    .filter(Boolean)
    .join(" ");
}
