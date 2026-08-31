// Meal maths, kept out of the component so it can be tested without a DOM.
// Everything here is pure: same selections in, same totals out.
import {
  Chain,
  NUTRIENT_FIELDS,
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
  const portionCats = new Set(chain.portion?.categories ?? []);
  const t = emptyTotals();
  for (const c of chain.components) {
    const qty = selections[c.id];
    if (!qty) continue;
    const scale = portionCats.has(c.category) ? portion : 1;
    const k = qty * (activeMode?.multipliers[c.category] ?? 1) * scale;
    for (const f of NUTRIENT_FIELDS) t[f] += c[f] * k;
  }
  return t;
}
