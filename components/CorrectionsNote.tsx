import type { Chain, NutrientField } from "@/lib/schema";
import { NUTRIENT_LABELS, NUTRIENT_UNITS } from "@/lib/schema";

/**
 * Every value where we did not use the number the chain printed.
 *
 * These are the only figures on the page that are not straight from the source,
 * so they get stated outright rather than left in the data. Each one says what
 * was published, what we used, and why.
 */
/**
 * Rows the chain sells but publishes no ingredient-level figures for, worked
 * out from figures it does publish. Stated in full, because a number of ours
 * must never pass for one of theirs.
 */
export function DerivedNote({ chain }: { chain: Chain }) {
  const rows = chain.components.filter((c) => c.derived);
  if (rows.length === 0) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none underline decoration-line underline-offset-2 hover:text-fg">
        {rows.length} {rows.length === 1 ? "value is" : "values are"} ours, not
        from {chain.name}
        <span className="ml-1 text-muted group-open:hidden" aria-hidden>
          &#9656;
        </span>
        <span className="ml-1 hidden text-muted group-open:inline" aria-hidden>
          &#9662;
        </span>
      </summary>
      <ul className="mt-2 space-y-2 border-l border-line pl-3">
        {rows.map((c) => (
          <li key={c.id}>
            <span className="font-medium text-fg">{c.name}</span> — {c.derived}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function CorrectionsNote({ chain }: { chain: Chain }) {
  const fixed = chain.components.filter((c) => c.corrections?.length);
  if (fixed.length === 0) return null;
  const total = fixed.reduce((n, c) => n + (c.corrections?.length ?? 0), 0);
  return (
    <details className="group">
      <summary className="cursor-pointer list-none underline decoration-line underline-offset-2 hover:text-fg">
        {total} published {total === 1 ? "value" : "values"} corrected
        <span className="ml-1 text-muted group-open:hidden" aria-hidden>
          ▸
        </span>
        <span className="ml-1 hidden text-muted group-open:inline" aria-hidden>
          ▾
        </span>
      </summary>
      <ul className="mt-2 space-y-2 border-l border-line pl-3">
        {fixed.map((c) =>
          (c.corrections ?? []).map((fix) => {
            const field = fix.field as NutrientField;
            const unit = NUTRIENT_UNITS[field] ?? "";
            return (
              <li key={`${c.id}-${fix.field}`}>
                <span className="font-medium text-fg">
                  {c.name}
                  {c.variant_label ? ` (${c.variant_label})` : ""}
                </span>{" "}
                — {NUTRIENT_LABELS[field] ?? fix.field}:{" "}
                <span className="line-through">
                  {fix.printed} {unit}
                </span>{" "}
                published, {fix.used} {unit} used. {fix.reason}
              </li>
            );
          }),
        )}
      </ul>
    </details>
  );
}
