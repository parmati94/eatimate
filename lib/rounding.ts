// FDA nutrition-label display rounding (21 CFR 101.9(c)). Raw values are stored
// in the data files; these rules apply at display time only, so summed totals
// read like label numbers.

function toIncrement(v: number, inc: number): number {
  return Math.round(v / inc) * inc;
}

export function roundCalories(v: number): number {
  if (v < 5) return 0;
  if (v <= 50) return toIncrement(v, 5);
  return toIncrement(v, 10);
}

// Total/sat/trans fat share a rule; fiber/sugars/protein/carbs share another.
export function roundFat(v: number): number {
  if (v < 0.5) return 0;
  if (v < 5) return toIncrement(v, 0.5);
  return toIncrement(v, 1);
}

export function roundGrams(v: number): number {
  if (v < 0.5) return 0;
  if (v < 1) return 1; // label shows "less than 1 g"; display as <1 upstream
  return toIncrement(v, 1);
}

export function roundCholesterol(v: number): number {
  if (v < 2) return 0;
  if (v <= 5) return 5; // label shows "less than 5 mg"
  return toIncrement(v, 5);
}

export function roundSodium(v: number): number {
  if (v < 5) return 0;
  if (v <= 140) return toIncrement(v, 5);
  return toIncrement(v, 10);
}

// FDA Daily Values (2016 final rule, adults).
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
