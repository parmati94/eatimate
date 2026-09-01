/** Small shared helpers for the builder's parts. Pulled out of MealBuilder.tsx
 *  because the rows and the share/save actions both need them, and a helper
 *  reachable from only one of two callers is how the two drift apart. */
import type { Component } from "@/lib/schema";
import { Selections, encodeMeal } from "@/lib/meal";

export function fmtQty(q: number): string {
  return q === 0.5 ? "½×" : `${q}×`;
}

// ---- URL meal state: /chain?m=id,id:0.5,id:2 ------------------------------

/**
 * The shareable URL for a meal, computed from state rather than read back out
 * of the address bar -- the effect below writes there on a delay, so
 * window.location can trail the current selections by a moment.
 */
export function mealUrl(sel: Selections, portion = 1): string {
  const url = new URL(window.location.href);
  const encoded = encodeMeal(sel);
  if (encoded) url.searchParams.set("m", encoded);
  else url.searchParams.delete("m");
  if (portion > 1) url.searchParams.set("p", String(portion));
  else url.searchParams.delete("p");
  return url.href;
}

/**
 * How many choices a category actually offers.
 *
 * Not comps.length: sizes collapse into one row carrying chips, and add-ons
 * render inside their parent's row. Potbelly's bread is 15 components and 6
 * choices, and a header reading "15" over six rows is just wrong.
 */
export function choiceCount(comps: Component[]): number {
  return comps.filter((c) => !c.variant_of && !c.addon_of).length;
}

/** Display name including its size, so "Fries" never loses which one. */
export function fullName(c: Component): string {
  return c.variant_label ? `${c.name} (${c.variant_label})` : c.name;
}

export function picksSummary(comps: Component[], selections: Selections): string {
  const picked = comps.filter((c) => selections[c.id]);
  if (picked.length === 0) return "";
  return picked
    .map((c) => {
      const q = selections[c.id];
      return q === 1 ? fullName(c) : `${fmtQty(q)} ${fullName(c)}`;
    })
    .join("  +  ");
}
