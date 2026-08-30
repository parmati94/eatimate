import type { Totals } from "@/lib/schema";
import {
  pctDV,
  roundCalories,
  roundCholesterol,
  roundFat,
  roundGrams,
  roundSodium,
} from "@/lib/rounding";

function Row({
  label,
  value,
  unit,
  dv,
  indent = false,
  bold = false,
}: {
  label: string;
  value: number;
  unit: string;
  dv?: number;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between border-t border-neutral-300 py-1 text-sm dark:border-neutral-700 ${indent ? "pl-4" : ""}`}
    >
      <span>
        <span className={bold ? "font-bold" : ""}>{label}</span> {value}
        {unit}
      </span>
      {dv !== undefined && <span className="font-bold">{dv}%</span>}
    </div>
  );
}

export default function NutritionLabel({ totals }: { totals: Totals }) {
  return (
    <div className="rounded border-2 border-neutral-900 bg-white p-3 font-sans dark:border-neutral-100 dark:bg-neutral-900">
      <p className="text-2xl font-extrabold leading-tight">Nutrition Facts</p>
      <p className="border-b-8 border-neutral-900 pb-1 text-xs dark:border-neutral-100">
        Your meal as built
      </p>
      <div className="flex items-end justify-between py-1">
        <span className="text-xl font-extrabold">Calories</span>
        <span className="text-3xl font-extrabold">
          {roundCalories(totals.calories)}
        </span>
      </div>
      <div className="border-t-4 border-neutral-900 text-right text-xs font-bold dark:border-neutral-100">
        % Daily Value*
      </div>
      <Row
        label="Total Fat"
        value={roundFat(totals.fat_g)}
        unit="g"
        dv={pctDV("fat_g", totals.fat_g)}
        bold
      />
      <Row
        label="Saturated Fat"
        value={roundFat(totals.sat_fat_g)}
        unit="g"
        dv={pctDV("sat_fat_g", totals.sat_fat_g)}
        indent
      />
      <Row
        label="Trans Fat"
        value={roundFat(totals.trans_fat_g)}
        unit="g"
        indent
      />
      <Row
        label="Cholesterol"
        value={roundCholesterol(totals.cholesterol_mg)}
        unit="mg"
        dv={pctDV("cholesterol_mg", totals.cholesterol_mg)}
        bold
      />
      <Row
        label="Sodium"
        value={roundSodium(totals.sodium_mg)}
        unit="mg"
        dv={pctDV("sodium_mg", totals.sodium_mg)}
        bold
      />
      <Row
        label="Total Carbohydrate"
        value={roundGrams(totals.carbs_g)}
        unit="g"
        dv={pctDV("carbs_g", totals.carbs_g)}
        bold
      />
      <Row
        label="Dietary Fiber"
        value={roundGrams(totals.fiber_g)}
        unit="g"
        dv={pctDV("fiber_g", totals.fiber_g)}
        indent
      />
      <Row
        label="Total Sugars"
        value={roundGrams(totals.sugars_g)}
        unit="g"
        indent
      />
      <Row
        label="Protein"
        value={roundGrams(totals.protein_g)}
        unit="g"
        bold
      />
      <p className="mt-2 border-t border-neutral-300 pt-1 text-[10px] leading-snug text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        *Percent Daily Values are based on a 2,000 calorie diet. Values are
        approximations derived from restaurant-published data.
      </p>
    </div>
  );
}
