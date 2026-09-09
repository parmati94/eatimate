// The "healthier" verdict, client-safe.
//
// "Is Chipotle or CAVA healthier" is what people type into a search box, and
// the honest answer is that it depends what healthier means. So the page never
// answers with one number. It names a measure -- fewest calories, most protein
// per calorie, least sodium, least saturated fat -- answers for THAT measure
// from the two meals in front of the visitor, and lets them change the
// measure. Every sentence here is arithmetic on published figures. None of it
// is an opinion about either chain, and a nutrient one chain leaves
// unpublished gets no call at all, for the same reason compareRows gives it
// no row: "0 mg" would be the most flattering possible lie.
//
// Pure, so the same function writes the server-rendered sentence a crawler
// reads, the live one under the builders, the meta description and the
// FAQ answer -- and all four agree.
import { fmtNutrient, type MealFacts } from "./compare";
import { show } from "./rounding";
import { NUTRIENT_LABELS, type NutrientField, type Totals } from "./schema";

export type MeasureId = "calories" | "protein" | "sodium" | "sat_fat";

export interface Measure {
  id: MeasureId;
  /** The pill. */
  label: string;
  /** What the verdict reads. Any of these unpublished on either side means no
   *  call; the sentence says which chain and which nutrient instead. */
  fields: NutrientField[];
  score: (t: Totals) => number;
  /** Lower score wins unless set. */
  higherWins?: boolean;
  /** "has fewer calories" -- the clause after the winner's name. */
  claim: string;
  /** The figure with its unit, and bare, for "540 cal against 430". */
  fmt: (v: number) => string;
  bare: (v: number) => string;
  /** For a tie: "on calories". */
  noun: string;
}

const perHundred = (t: Totals) =>
  t.calories > 0 ? (t.protein_g / t.calories) * 100 : 0;

export const MEASURES: readonly Measure[] = [
  {
    id: "calories",
    label: "Fewest calories",
    fields: ["calories"],
    score: (t) => t.calories,
    claim: "has fewer calories",
    fmt: (v) => `${fmtNutrient(v, "calories")} cal`,
    bare: (v) => String(fmtNutrient(v, "calories")),
    noun: "calories",
  },
  {
    // Per 100 calories rather than a ratio: "6.2 g per 100 cal" is a figure
    // a person can hold, "0.062" is not. Protein alone would just reward the
    // bigger meal.
    id: "protein",
    label: "Most protein per calorie",
    fields: ["protein_g", "calories"],
    score: perHundred,
    higherWins: true,
    claim: "has more protein per calorie",
    fmt: (v) => `${show(v, 1)} g per 100 cal`,
    bare: (v) => String(show(v, 1)),
    noun: "protein per calorie",
  },
  {
    id: "sodium",
    label: "Least sodium",
    fields: ["sodium_mg"],
    score: (t) => t.sodium_mg,
    claim: "has less sodium",
    fmt: (v) => `${fmtNutrient(v, "sodium_mg")} mg`,
    bare: (v) => String(fmtNutrient(v, "sodium_mg")),
    noun: "sodium",
  },
  {
    id: "sat_fat",
    label: "Least saturated fat",
    fields: ["sat_fat_g"],
    score: (t) => t.sat_fat_g,
    claim: "has less saturated fat",
    fmt: (v) => `${fmtNutrient(v, "sat_fat_g")} g`,
    bare: (v) => String(fmtNutrient(v, "sat_fat_g")),
    noun: "saturated fat",
  },
];

export const DEFAULT_MEASURE: MeasureId = "calories";

export function measureById(id: string): Measure {
  return MEASURES.find((m) => m.id === id) ?? MEASURES[0];
}

export type Verdict =
  /** A side has nothing picked, so there is nothing to compare. */
  | { kind: "empty"; sentence: string }
  /** A chain does not publish a nutrient the measure needs. */
  | { kind: "unpublished"; sentence: string; side: number; field: NutrientField }
  | { kind: "tie"; sentence: string }
  | { kind: "call"; sentence: string; winner: number };

/**
 * The verdict for one measure, from the two meals as they stand.
 *
 * `picked` says whether each side has anything in it. Totals alone cannot:
 * an empty side totals 0 and would "win" every lowest-is-best measure.
 */
export function verdict(
  measure: Measure,
  facts: MealFacts[],
  names: string[],
  picked: boolean[],
): Verdict {
  if (picked.some((p) => !p)) {
    return {
      kind: "empty",
      sentence: "Pick something on both sides and the verdict appears here.",
    };
  }
  for (const [i, f] of facts.entries()) {
    const field = measure.fields.find((x) => f.unknown.has(x));
    if (field) {
      return {
        kind: "unpublished",
        side: i,
        field,
        sentence: `${names[i]} doesn’t publish ${NUTRIENT_LABELS[field]}, so there’s no honest call on this one.`,
      };
    }
  }
  const scores = facts.map((f) => measure.score(f.totals));
  // Compare what the page shows, not the raw floats: two meals that both
  // display as 540 cal are a tie, whatever the binary noise says.
  const shown = scores.map((s) => measure.bare(s));
  if (shown[0] === shown[1]) {
    return {
      kind: "tie",
      sentence: `A tie on ${measure.noun}: ${measure.fmt(scores[0])} at both.`,
    };
  }
  const best = measure.higherWins ? Math.max(...scores) : Math.min(...scores);
  const winner = scores.indexOf(best);
  const loser = 1 - winner;
  return {
    kind: "call",
    winner,
    sentence: `${names[winner]} ${measure.claim}: ${measure.fmt(scores[winner])} against ${measure.bare(scores[loser])} at ${names[loser]}.`,
  };
}

/**
 * All four measures in one paragraph, for the FAQ answer and anywhere else
 * the question gets answered without a control to change the measure.
 *
 * Reads the calls only; a tie or an unpublished nutrient is left out rather
 * than padding the answer with what could not be decided.
 */
export function verdictSummary(
  facts: MealFacts[],
  names: string[],
  picked: boolean[],
  dish?: string,
): string {
  const calls = MEASURES.map((m) => verdict(m, facts, names, picked)).filter(
    (v): v is Extract<Verdict, { kind: "call" }> => v.kind === "call",
  );
  // A colon after the lead, so the chain name that follows keeps its capital.
  const lead = dish ? `For the same ${dish.toLowerCase()}: ` : "";
  if (calls.length === 0) {
    const none = `neither ${names[0]} nor ${names[1]} comes out ahead on calories, protein per calorie, sodium or saturated fat. Change either order on this page and the verdict moves.`;
    return lead ? lead + none : none.charAt(0).toUpperCase() + none.slice(1);
  }
  const body = calls.map((c) => c.sentence.replace(/\.$/, "")).join("; ");
  return `${lead}${body}. It depends what you order: change either order on this page and the verdict moves.`;
}
