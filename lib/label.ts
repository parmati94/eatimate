// The FDA panel's rows, defined once. NutritionLabel renders these to the DOM
// and labelImage draws the same list to a canvas, so the two cannot drift.
import type { Totals } from "./schema";
import {
  pctDV,
  roundCalories,
  roundCholesterol,
  roundFat,
  roundGrams,
  roundSodium,
} from "./rounding";

export interface LabelRow {
  label: string;
  value: number;
  unit: string;
  /** Percent daily value, where the FDA declares one for this nutrient. */
  dv?: number;
  indent?: boolean;
  bold?: boolean;
}

export const LABEL_FOOTNOTE =
  "*Percent Daily Values are based on a 2,000 calorie diet. Values are approximations derived from restaurant-published data.";

export function labelCalories(totals: Totals): number {
  return roundCalories(totals.calories);
}

export function labelRows(totals: Totals): LabelRow[] {
  return [
    { label: "Total Fat", value: roundFat(totals.fat_g), unit: "g", dv: pctDV("fat_g", totals.fat_g), bold: true },
    { label: "Saturated Fat", value: roundFat(totals.sat_fat_g), unit: "g", dv: pctDV("sat_fat_g", totals.sat_fat_g), indent: true },
    { label: "Trans Fat", value: roundFat(totals.trans_fat_g), unit: "g", indent: true },
    { label: "Cholesterol", value: roundCholesterol(totals.cholesterol_mg), unit: "mg", dv: pctDV("cholesterol_mg", totals.cholesterol_mg), bold: true },
    { label: "Sodium", value: roundSodium(totals.sodium_mg), unit: "mg", dv: pctDV("sodium_mg", totals.sodium_mg), bold: true },
    { label: "Total Carbohydrate", value: roundGrams(totals.carbs_g), unit: "g", dv: pctDV("carbs_g", totals.carbs_g), bold: true },
    { label: "Dietary Fiber", value: roundGrams(totals.fiber_g), unit: "g", dv: pctDV("fiber_g", totals.fiber_g), indent: true },
    { label: "Total Sugars", value: roundGrams(totals.sugars_g), unit: "g", indent: true },
    { label: "Protein", value: roundGrams(totals.protein_g), unit: "g", bold: true },
  ];
}
