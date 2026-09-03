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

/**
 * The customer's word for a category's role.
 *
 * The charts are written in the chain's vocabulary -- "Limeades & Slushes",
 * "Shakes, Blasts & Sundaes", "Ched 'R' Peppers" -- and a blank field asks for
 * a word the visitor has no way to know. Folding the role in means one word
 * covers four of Sonic's headings, whether it is typed or tapped.
 *
 * `format` and `other` get none: a bread size is not a food group, and "other"
 * is not a word anyone would search for.
 */
const ROLE_WORDS: Record<string, string> = {
  preset: "Menu items",
  entree: "Mains",
  protein: "Protein",
  base: "Bases",
  side: "Sides",
  drink: "Drinks",
  dessert: "Sweets",
  sauce: "Sauces",
  topping: "Toppings",
  cheese: "Cheese",
  kids: "Kids",
};

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

/**
 * The handful of words worth offering as a tap, commonest first.
 *
 * They are shortcuts, not a second mechanism: a chip fills the field with its
 * own word and the search runs exactly as if it had been typed.
 *
 * Which is why the number on a chip is the number of rows the SEARCH returns,
 * not the number of rows in those roles. The two differ, sometimes wildly --
 * Subway files 18 rows under Protein, and searching "protein" finds 46,
 * because the word is in the serving text of every sandwich. A chip promising
 * 18 and delivering 46 is a chip that lies on the way to a list you can count.
 */
export function roleChips(
  families: MenuFamily[],
  reachable: Set<string>,
  limit = 4,
): { word: string; count: number }[] {
  const byRole = new Map<string, number>();
  for (const f of families) {
    if (!reachable.has(f.cat.id)) continue;
    const word = f.cat.role ? ROLE_WORDS[f.cat.role] : undefined;
    if (!word) continue;
    byRole.set(word, (byRole.get(word) ?? 0) + 1);
  }
  // Role frequency picks the candidates -- it is one pass and it is what makes
  // the words relevant to this chain -- then each survivor is priced properly.
  return [...byRole]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => ({
      word,
      count: searchMenu(families, word, reachable).hits.length,
    }))
    .sort((a, b) => b.count - a.count);
}

/** How many rows the field is offering to search, for it to say so. */
export function reachableCount(families: MenuFamily[], reachable: Set<string>): number {
  return families.filter((f) => reachable.has(f.cat.id)).length;
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
 * serving text, the size labels, the category and the customer's word for what
 * that category is — so "cherry rt" finds the add-in at Route 44, "drinks"
 * lists all four of Sonic's drink headings, and "sweets" finds the sundaes.
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
    const where = norm(
      [f.cat.name, f.cat.role ? ROLE_WORDS[f.cat.role] : ""].join(" "),
    );
    const all = `${own} ${where}`;
    if (!terms.every((t) => all.includes(t))) continue;
    if (reachable && !reachable.has(f.cat.id)) {
      elsewhere++;
      continue;
    }
    (terms.every((t) => own.includes(t)) ? named : filed).push(f);
  }
  return { hits: [...named, ...filed], elsewhere };
}
