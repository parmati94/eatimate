import { fmtNutrient, type CompareRow } from "@/lib/compare";

/**
 * The diff table, rendered identically by the static page and the live
 * two-panel builder so the two can never drift.
 *
 * Nothing here colours a value good or bad: more protein and more sodium are
 * both "higher", and which one you want is not ours to say. The only emphasis
 * is on which side is larger.
 */
export default function CompareTable({
  rows,
  names,
}: {
  rows: CompareRow[];
  names: string[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-1.5 pr-2 text-left font-medium">Per meal as built</th>
            {names.map((n) => (
              <th key={n} className="py-1.5 pl-2 text-right font-medium sm:pl-3">
                {n}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right font-medium sm:pl-3">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field} className="border-b border-line/60 last:border-0">
              <td className="py-1.5 pr-2 capitalize text-muted">{r.label}</td>
              {r.values.map((v, i) => (
                <td
                  key={i}
                  className={`py-1.5 pl-2 text-right tabular-nums sm:pl-3 ${
                    r.highest === i ? "font-semibold text-fg" : "text-muted"
                  }`}
                >
                  {v === null ? (
                    <span title={`${names[i]} does not publish this`}>
                      not published
                    </span>
                  ) : (
                    <>
                      {r.approx[i] && "≈ "}
                      {fmtNutrient(v, r.field)}
                      {r.unit}
                    </>
                  )}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right tabular-nums text-muted sm:pl-3">
                {r.spread === null
                  ? "—"
                  : r.spread === 0
                    ? "same"
                    : `+${fmtNutrient(r.spread, r.field)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
