"use client";

/** The meal as a row of removable chips: the only place the page says what you
 *  picked by NAME.
 *
 *  Everything else counts. The label gives a total, the bar gives a total and a
 *  count, and every category header summarises only its own picks -- so with
 *  four things chosen across four collapsed accordions there was no screen
 *  anywhere that listed them. Search makes that worse before it makes it
 *  better, because it hands you a way to add from a surface you then leave. */
import type { Chain, SizeMode } from "@/lib/schema";
import { Selections, mealLines } from "@/lib/meal";
import { IconX } from "../icons";
import { fmtQty, fullName } from "./format";

export default function YourPicks({
  chain,
  selections,
  activeMode,
  portion,
  onRemove,
}: {
  chain: Chain;
  selections: Selections;
  activeMode?: SizeMode | null;
  portion?: number;
  onRemove: (id: string) => void;
}) {
  const lines = mealLines(chain, selections, activeMode, portion);
  if (lines.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-2 shadow-sm">
      <h2 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Your picks
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {lines.map(({ comp, qty, calories }) => (
          <li key={comp.id} className="max-w-full">
            {/* The whole chip removes, not just the cross: a 16px target inside
                a chip you can already hit is a smaller target for no reason.
                No confirm -- a mis-tap costs one re-add, and a dialog on every
                one of these would cost more than the mistake does. */}
            <button
              type="button"
              onClick={() => onRemove(comp.id)}
              aria-label={`Remove ${fullName(comp)}`}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-accent/60 bg-accent-soft py-1 pl-2.5 pr-1.5 text-xs transition-colors hover:border-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="min-w-0 truncate font-medium">
                {qty !== 1 && <span className="num">{fmtQty(qty)} </span>}
                {fullName(comp)}
              </span>
              {/* The scaled figure, so the chips account for the total below
                  them rather than quoting the chart at a size nobody picked. */}
              <span className="num shrink-0 text-[11px] text-muted">
                {Math.round(calories)}
              </span>
              <span
                aria-hidden
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface text-muted"
              >
                <IconX className="h-2.5 w-2.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
