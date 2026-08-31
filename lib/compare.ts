// Comparison maths, client-safe.
//
// Split from lib/meals.ts, which reads the chain files off disk and cannot be
// imported into a client component. Everything here is pure and takes only the
// three facts a comparison actually needs from a meal, so the same function
// serves the statically rendered page and the live two-panel builder.
import { show } from "./rounding";
import {
  NUTRIENT_FIELDS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  NutrientField,
  Totals,
} from "./schema";

/** What comparing needs to know about a meal, whoever built it. */
export interface MealFacts {
  totals: Totals;
  /** Nutrients the chain does not publish at all. */
  unknown: ReadonlySet<NutrientField>;
  /** Nutrients whose total leans on a figure we estimated. */
  estimated: ReadonlySet<NutrientField>;
}

export interface CompareRow {
  field: NutrientField;
  label: string;
  unit: string;
  /** null when that chain does not publish this nutrient. */
  values: (number | null)[];
  approx: boolean[];
  /** Index of the highest value; null when tied or any side is unpublished. */
  highest: number | null;
  /** Gap between highest and lowest; null only when a side is unpublished. */
  spread: number | null;
}

/**
 * The comparison rows for a set of meals, in label order.
 *
 * A nutrient any one chain leaves unpublished is compared for nobody. Chipotle
 * publishes no cholesterol; ranking its bowl against CAVA's on a number
 * Chipotle never measured would be inventing the finding, and "0 mg" would be
 * the most flattering possible lie.
 */
export function compareRows(meals: MealFacts[]): CompareRow[] {
  return NUTRIENT_FIELDS.map((field) => {
    const known = meals.every((m) => !m.unknown.has(field));
    const values = meals.map((m) => (m.unknown.has(field) ? null : m.totals[field]));
    const nums = values.filter((v): v is number => v !== null);
    // A spread of 0 and a spread that cannot be taken are different findings:
    // two bowls with the same sodium is an answer, and the page says "same".
    // Only an unpublished nutrient has no answer at all.
    const highest =
      known && new Set(nums).size > 1 ? values.indexOf(Math.max(...nums)) : null;
    return {
      field,
      label: NUTRIENT_LABELS[field],
      unit: NUTRIENT_UNITS[field],
      values,
      approx: meals.map((m) => m.estimated.has(field)),
      highest,
      spread: known ? Math.max(...nums) - Math.min(...nums) : null,
    };
  });
}

/** Alphabetical, so one ordering of a pair is always the canonical URL. */
export function pairSlug(a: string, b: string): string {
  return [a, b].sort().join("-vs-");
}

export function parsePair(slug: string): [string, string] | null {
  const parts = slug.split("-vs-");
  if (parts.length !== 2 || parts[0] === parts[1]) return null;
  if (!parts.every((p) => /^[a-z0-9-]+$/.test(p))) return null;
  return [parts[0], parts[1]];
}

// Whole numbers where the chains publish whole numbers, one decimal for grams.
const DP: Partial<Record<NutrientField, number>> = {
  calories: 0,
  cholesterol_mg: 0,
  sodium_mg: 0,
};

export function fmtNutrient(v: number, field: NutrientField): number {
  return show(v, DP[field] ?? 1);
}
