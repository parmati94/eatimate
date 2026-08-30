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
      className={`flex justify-between border-t border-neutral-400 py-[3px] text-[13px] leading-tight ${indent ? "pl-4" : ""}`}
    >
      <span>
        <span className={bold ? "font-bold" : ""}>{label}</span>{" "}
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      {dv !== undefined && (
        <span className="font-bold tabular-nums">{dv}%</span>
      )}
    </div>
  );
}

/**
 * FDA-style label. Deliberately rendered black-on-white in both color schemes
 * so a photo of it (Lose It!, MyFitnessPal label scan) reads like a real label.
 */
export default function NutritionLabel({ totals }: { totals: Totals }) {
  return (
    <div className="rounded-lg border-2 border-black bg-white p-3 text-black shadow-sm">
      <p className="text-[26px] font-black leading-none tracking-tight">
        Nutrition Facts
      </p>
      <p className="mt-1 border-b-[7px] border-black pb-1 text-xs">
        Your meal as built
      </p>
      <div className="flex items-end justify-between py-1">
        <span className="text-lg font-black">Calories</span>
        <span className="text-[32px] font-black leading-none tabular-nums">
          {roundCalories(totals.calories)}
        </span>
      </div>
      <div className="border-t-4 border-black pt-0.5 text-right text-[11px] font-bold">
        % Daily Value*
      </div>
      <Row label="Total Fat" value={roundFat(totals.fat_g)} unit="g" dv={pctDV("fat_g", totals.fat_g)} bold />
      <Row label="Saturated Fat" value={roundFat(totals.sat_fat_g)} unit="g" dv={pctDV("sat_fat_g", totals.sat_fat_g)} indent />
      <Row label="Trans Fat" value={roundFat(totals.trans_fat_g)} unit="g" indent />
      <Row label="Cholesterol" value={roundCholesterol(totals.cholesterol_mg)} unit="mg" dv={pctDV("cholesterol_mg", totals.cholesterol_mg)} bold />
      <Row label="Sodium" value={roundSodium(totals.sodium_mg)} unit="mg" dv={pctDV("sodium_mg", totals.sodium_mg)} bold />
      <Row label="Total Carbohydrate" value={roundGrams(totals.carbs_g)} unit="g" dv={pctDV("carbs_g", totals.carbs_g)} bold />
      <Row label="Dietary Fiber" value={roundGrams(totals.fiber_g)} unit="g" dv={pctDV("fiber_g", totals.fiber_g)} indent />
      <Row label="Total Sugars" value={roundGrams(totals.sugars_g)} unit="g" indent />
      <Row label="Protein" value={roundGrams(totals.protein_g)} unit="g" bold />
      <p className="mt-1.5 border-t-[5px] border-black pt-1.5 text-[10px] leading-snug text-neutral-700">
        *Percent Daily Values are based on a 2,000 calorie diet. Values are
        approximations derived from restaurant-published data.
      </p>
    </div>
  );
}
