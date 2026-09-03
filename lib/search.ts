// Finding one row anywhere on a chain's chart.
//
// The accordions answer "what can I add?"; this answers "where is the thing I
// already know I want", which on the fat charts is a different question with a
// different shape. Buffalo Wild Wings puts 358 rows under eleven headings, and
// no arrangement of eleven headings makes the 358th reachable.
//
// Pure, like lib/flow.ts, so it can be run over the real chain files in a test
// rather than clicked through in a browser.
import type { Category, Chain, Component } from "./schema";

export interface MenuFamily {
  /** Where the row lives. A result is meaningless without it: "Regular" says
   *  nothing outside "Ranch Dressing". */
  cat: Category;
  head: Component;
  /** The family, head first. Length 1 for a row with no sizes. */
  members: Component[];
}

/**
 * One category's rows, size families collapsed into their head.
 *
 * Add-ons are left out: they render inside the row they extend, so listing
 * them here would offer them as alternatives to it.
 */
export function familiesOf(comps: Component[]): { head: Component; members: Component[] }[] {
  const kids = new Map<string, Component[]>();
  for (const c of comps) {
    if (!c.variant_of || c.addon_of) continue;
    kids.set(c.variant_of, [...(kids.get(c.variant_of) ?? []), c]);
  }
  return comps
    .filter((c) => !c.variant_of && !c.addon_of)
    .map((head) => ({ head, members: [head, ...(kids.get(head.id) ?? [])] }));
}

/** Every row on the chart, in config order, each carrying its category. */
export function menuFamilies(
  chain: Chain,
  visible: Map<string, Component[]>,
): MenuFamily[] {
  const out: MenuFamily[] = [];
  for (const cat of chain.categories) {
    const comps = visible.get(cat.id);
    if (!comps) continue;
    for (const f of familiesOf(comps)) out.push({ cat, ...f });
  }
  return out;
}

/**
 * Letters and digits only.
 *
 * The charts are full of marks nobody types: CHED 'R' BITES®, M&M'S® MINIS,
 * BARQ'S® ROOT BEER. Reducing both sides to words means "ched r bites" finds
 * the first.
 *
 * Apostrophes go first and leave no gap, because a possessive is one word to
 * the person typing it: turning them into spaces like every other mark made
 * BARQ'S into "barq s", which "barqs" does not match -- and the roster is full
 * of them (Jimmy John's, Culver's, Wendy's).
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface MenuSearchResult {
  /** Matches reachable on the path in effect, name matches first. */
  hits: MenuFamily[];
  /** How many matches are only on the OTHER path, so the empty state can say
   *  so rather than claiming the chain does not sell the thing. */
  elsewhere: number;
}

/**
 * Every row matching `query`, on the path in effect.
 *
 * All terms must match, and they may match across the name, the chain's own
 * serving text, the size labels and the category — so "cherry rt" finds the
 * add-in at Route 44, and "drink" lists the drinks.
 *
 * A match on the item itself outranks one that only matched the category:
 * typing "sides" should not bury Groovy Fries under everything filed beside it.
 */
export function searchMenu(
  families: MenuFamily[],
  query: string,
  reachable?: Set<string>,
): MenuSearchResult {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.length) return { hits: [], elsewhere: 0 };
  const named: MenuFamily[] = [];
  const filed: MenuFamily[] = [];
  let elsewhere = 0;
  for (const f of families) {
    const own = norm(
      [f.head.name, f.head.serving_desc, ...f.members.map((m) => m.variant_label ?? "")].join(" "),
    );
    const all = `${own} ${norm(f.cat.name)}`;
    if (!terms.every((t) => all.includes(t))) continue;
    if (reachable && !reachable.has(f.cat.id)) {
      elsewhere++;
      continue;
    }
    (terms.every((t) => own.includes(t)) ? named : filed).push(f);
  }
  return { hits: [...named, ...filed], elsewhere };
}
