// Display rounding. Nothing here follows FDA label increments: the values we
// hold are already the figures each chain published, so a total is the exact
// sum of them. Rounding that sum to the nearest 10 would ADD error, and made a
// 5-calorie sauce appear to move the total by 10 -- which reads as a bug and
// costs more trust than a tidy-looking number buys.
//
// All this does is keep floating-point sums legible: 4.5 + 0.5 + 7.8 is
// 12.799999999999999 in binary, and nobody wants to read that.

/** Round to `dp` decimals, dropping binary noise and trailing zeros. */
export function show(v: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export const DAILY_VALUES = {
  fat_g: 78,
  sat_fat_g: 20,
  cholesterol_mg: 300,
  sodium_mg: 2300,
  carbs_g: 275,
  fiber_g: 28,
  protein_g: 50,
} as const;

export function pctDV(field: keyof typeof DAILY_VALUES, v: number): number {
  return Math.round((v / DAILY_VALUES[field]) * 100);
}
