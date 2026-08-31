import type { Totals } from "@/lib/schema";
import { LABEL_FOOTNOTE, labelCalories, labelRows } from "@/lib/label";

function Row({
  label,
  value,
  approx = false,
  unit,
  dv,
  indent = false,
  bold = false,
}: {
  label: string;
  value: number | null;
  approx?: boolean;
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
          {value === null ? (
            <span title="not published by this chain">not published</span>
          ) : (
            <>
              {approx && "≈ "}
              {value}
              {unit}
              {approx && (
                <span className="ml-1 font-normal text-neutral-600">
                  &middot; includes an estimate
                </span>
              )}
            </>
          )}
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
export default function NutritionLabel({
  totals,
  subtitle,
  missing,
  estimated,
}: {
  missing?: ReadonlySet<string>;
  estimated?: ReadonlySet<string>;
  totals: Totals;
  subtitle?: string;
}) {
  return (
    <div className="num rounded-lg border-2 border-black bg-white p-3 text-black shadow-sm">
      <p className="text-[27px] font-extrabold leading-none tracking-tight">
        Nutrition Facts
      </p>
      <p className="mt-1 border-b-[7px] border-black pb-1 text-xs">
        {subtitle ?? "Your meal as built"}
      </p>
      <div className="flex items-end justify-between py-1">
        <span className="text-lg font-extrabold">Calories</span>
        <span className="text-[34px] font-extrabold leading-none">
          {labelCalories(totals)}
        </span>
      </div>
      <div className="border-t-4 border-black pt-0.5 text-right text-[11px] font-bold">
        % Daily Value*
      </div>
      {labelRows(totals, missing, estimated).map((r) => (
        <Row key={r.label} {...r} />
      ))}
      <p className="mt-1.5 border-t-[5px] border-black pt-1.5 text-[10px] leading-snug text-neutral-700">
        {LABEL_FOOTNOTE}
      </p>
    </div>
  );
}
