// Meal maths, kept out of the component so it can be tested without a DOM.
// Everything here is pure: same selections in, same totals out.
import {
  Chain,
  Component,
  NUTRIENT_FIELDS,
  NutrientField,
  SizeMode,
  Totals,
} from "./schema";

/** component id -> qty multiplier */
export type Selections = Record<string, number>;

// Extended so per-piece items (wings, tenders) can reach real order sizes.
export const QTY_STEPS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];
// Where a portion control carries "how much did you eat", a component's own
// quantity means coverage instead, and 20x pepperoni is not a coverage.
export const COVERAGE_STEPS = [0.5, 1, 2];

export function emptyTotals(): Totals {
  return Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, 0])) as Totals;
}

// ---- URL meal state: /chain?m=id,id:0.5,id:2 ------------------------------

export function encodeMeal(sel: Selections): string {
  return Object.entries(sel)
    .map(([id, q]) => (q === 1 ? id : `${id}:${q}`))
    .join(",");
}

/** Ignores ids the chain no longer has and quantities off the step scale, so a
 *  stale or hand-edited link degrades to the part that still makes sense. */
export function decodeMeal(raw: string, chain: Chain): Selections {
  const valid = new Set(chain.components.map((c) => c.id));
  const sel: Selections = {};
  for (const part of raw.split(",")) {
    const [id, qRaw] = part.split(":");
    const q = qRaw === undefined ? 1 : Number(qRaw);
    if (valid.has(id) && QTY_STEPS.includes(q)) sel[id] = q;
  }
  return sel;
}

/**
 * The size mode a chain falls back to when nothing has chosen one.
 * Null for the chains (most of them) that have no chain-wide sizing.
 */
export function defaultSizeMode(chain: Chain): SizeMode | null {
  const modes = chain.size_modes;
  if (!modes) return null;
  return modes.find((m) => m.default) ?? modes[0] ?? null;
}

/**
 * The size mode the current selections put the chain in: the format pick IS
 * the size choice (picking Footlong scales the whole build), so this reads it
 * back off the selections rather than tracking it separately.
 *
 * Pure, and exported, because the comparison view needs a second meal's totals
 * without mounting a second builder to compute them.
 */
export function activeSizeMode(
  chain: Chain,
  selections: Selections,
): SizeMode | null {
  const modes = chain.size_modes;
  if (!modes) return null;
  const fallback = defaultSizeMode(chain);
  for (const c of chain.components) {
    if (selections[c.id] && c.size_mode) {
      return modes.find((m) => m.id === c.size_mode) ?? fallback;
    }
  }
  return fallback;
}

/**
 * Raw (unrounded) totals for a meal.
 *
 * Three multipliers stack: the component's own quantity, the active size mode's
 * per-category multiplier (Subway footlong), and the portion — how much of the
 * built item was eaten, which applies only to the categories the chain says it
 * divides into (a Papa John's topping scales with slices; a side of
 * breadsticks does not).
 */
export function mealTotals(
  chain: Chain,
  selections: Selections,
  activeMode?: SizeMode | null,
  portion = 1,
): Totals {
  const t = emptyTotals();
  for (const { comp, scale } of scaled(chain, selections, activeMode, portion)) {
    for (const f of NUTRIENT_FIELDS) t[f] += (comp[f] ?? 0) * scale;
  }
  return t;
}

/** Everything selected, in chain order, with the factor its figures are
 *  multiplied by. The one place the three multipliers are stacked. */
function* scaled(
  chain: Chain,
  selections: Selections,
  activeMode?: SizeMode | null,
  portion = 1,
): Generator<{ comp: Component; qty: number; scale: number }> {
  const portionCats = new Set(chain.portion?.categories ?? []);
  for (const comp of chain.components) {
    const qty = selections[comp.id];
    if (!qty) continue;
    const share = portionCats.has(comp.category) ? portion : 1;
    yield {
      comp,
      qty,
      scale: qty * (activeMode?.multipliers[comp.category] ?? 1) * share,
    };
  }
}

export interface MealLine {
  comp: Component;
  qty: number;
  /** What this line contributes to the total, not what the chart prints. */
  calories: number;
}

/**
 * The meal as a list of lines.
 *
 * Shares its scaling with mealTotals, so a list of picks and the label under
 * it cannot drift: a footlong's 2x and half a pizza's 0.5 are applied here for
 * the same reason and by the same code.
 */
export function mealLines(
  chain: Chain,
  selections: Selections,
  activeMode?: SizeMode | null,
  portion = 1,
): MealLine[] {
  return [...scaled(chain, selections, activeMode, portion)].map(
    ({ comp, qty, scale }) => ({ comp, qty, calories: comp.calories * scale }),
  );
}

/**
 * Nutrients no total can be given for, because a selected item does not
 * publish them. Summing an absent value as zero and printing it would be
 * indistinguishable from the chain having measured zero.
 */
export function unknownNutrients(
  chain: Chain,
  selections: Selections,
): Set<NutrientField> {
  const out = new Set<NutrientField>();
  for (const c of chain.components) {
    if (!selections[c.id]) continue;
    for (const f of NUTRIENT_FIELDS) if (c[f] == null) out.add(f);
  }
  return out;
}

/**
 * Nutrients whose total includes a figure we estimated. The label marks these
 * approximate rather than printing them like measurements.
 */
export function estimatedNutrients(
  chain: Chain,
  selections: Selections,
): Set<NutrientField> {
  const out = new Set<NutrientField>();
  for (const c of chain.components) {
    if (!selections[c.id]) continue;
    for (const f of c.estimated ?? []) out.add(f as NutrientField);
  }
  return out;
}

/**
 * What the panel is actually measuring. A saved image outlives the page it came
 * from, so it has to say on its face which chain and how much.
 *
 * The chain name is always first -- on the page it is redundant, but in a photo
 * sitting in a food tracker it is the only thing identifying the meal. Where
 * there is no size mode or portion to add, the item count keeps the line from
 * being a bare restatement of the name.
 */
export function mealSubtitle(
  chain: Chain,
  modeName: string | null,
  portion = 1,
  portionMax = 0,
  itemCount = 0,
): string {
  const parts = [chain.name];
  if (modeName) parts.push(modeName);
  if (portionMax > 1 && chain.portion) {
    const unit = chain.portion.unit;
    parts.push(
      portion === portionMax
        ? `all ${portionMax} ${unit}s`
        : `${portion} of ${portionMax} ${unit}s`,
    );
  }
  if (parts.length === 1 && itemCount > 0) {
    parts.push(`${itemCount} item${itemCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
