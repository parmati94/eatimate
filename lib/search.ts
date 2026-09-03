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
 * "Shakes, Blasts & Sundaes", "Ched 'R' Peppers" -- so the word a visitor
 * reaches for is often on no heading anywhere. Folding the role into the
 * haystack means "drinks" covers four of Sonic's headings and "sweets" finds
 * the sundaes.
 *
 * `format` and `other` get none: a bread size is not a food group, and "other"
 * is not a word anyone would search for.
 */
const ROLE_WORDS: Record<string, string[]> = {
  preset: ["Menu items", "meals"],
  entree: ["Mains", "entrees"],
  protein: ["Protein"],
  base: ["Bases"],
  side: ["Sides"],
  // The only role with real synonyms in circulation, and the regional split
  // ("soda" against "pop") is the one people actually differ on.
  drink: ["Drinks", "soda", "pop", "beverages"],
  dessert: ["Sweets", "desserts"],
  sauce: ["Sauces"],
  topping: ["Toppings"],
  cheese: ["Cheese"],
  kids: ["Kids"],
};

/** The words filed under a category, or none. */
function wordsFor(cat: Category): string {
  return cat.role ? (ROLE_WORDS[cat.role] ?? []).join(" ") : "";
}

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
 * Accents are folded to their base letter FIRST, which is not cosmetic: the
 * old order dropped the letter entirely, so "Jalapeño" indexed as "jalape o"
 * and typing "jalapeno" -- the way almost everyone types it -- found nothing
 * on thirteen of the twenty-two chains. Same for Açaí, Sautéed, Patrón, Crème
 * and Entrée.
 *
 * Apostrophes go next and leave no gap, because a possessive is one word to
 * the person typing it: turning them into spaces like every other mark made
 * BARQ'S into "barq s", which "barqs" does not match -- and the roster is full
 * of them (Jimmy John's, Culver's, Wendy's).
 */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The run-together form of any initialism, added ALONGSIDE the spaced one.
 *
 * Punctuation becomes spaces, so `B.M.T.®` indexes as "b m t" and "bmt" misses
 * it. Appending "bmt" rather than replacing means "b.m.t.", "b m t" and "bmt"
 * all land, and nothing that matched before can stop matching.
 *
 * Five names in the whole dataset produce a run: Subway's B.M.T. and B.L.T.,
 * Jimmy John's J.J.B.L.T. and THE J.J. GARGANTUAN, and Five Guys' A.1.® Sauce.
 */
function runTogether(s: string): string {
  const runs = s.match(/\b(?:[a-z0-9] )+[a-z0-9]\b/g);
  return runs ? runs.map((r) => r.replaceAll(" ", "")).join(" ") : "";
}

/** Whether a term lands at the start of a word rather than inside one. */
function atWordStart(hay: string, term: string): boolean {
  return hay.startsWith(term) || hay.includes(` ${term}`);
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
 * Three tiers, and every one of them is an ordering, never a filter. A match
 * on the item outranks one that only matched the category -- typing "sides"
 * should not bury Groovy Fries under everything filed beside it -- and within
 * the item matches, a term landing at the start of a word outranks one buried
 * inside one. That second tier is why "cola" now leads with Coca-Cola instead
 * of Chocolate Shake, without dropping the chocolate: mid-word matching is
 * what makes "burger" find a CHEESEBURGER, and is worth keeping.
 */
export function searchMenu(
  families: MenuFamily[],
  query: string,
  reachable?: Set<string>,
): MenuSearchResult {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.length) return { hits: [], elsewhere: 0 };
  const lead: MenuFamily[] = [];
  const inside: MenuFamily[] = [];
  const filed: MenuFamily[] = [];
  let elsewhere = 0;
  for (const f of families) {
    const spaced = norm(
      [f.head.name, f.head.serving_desc, ...f.members.map((m) => m.variant_label ?? "")].join(" "),
    );
    const own = `${spaced} ${runTogether(spaced)}`.trim();
    const where = norm([f.cat.name, wordsFor(f.cat)].join(" "));
    const all = `${own} ${where}`;
    if (!terms.every((t) => all.includes(t))) continue;
    if (reachable && !reachable.has(f.cat.id)) {
      elsewhere++;
      continue;
    }
    if (!terms.every((t) => own.includes(t))) {
      filed.push(f);
    } else if (terms.every((t) => atWordStart(own, t))) {
      lead.push(f);
    } else {
      inside.push(f);
    }
  }
  return { hits: [...lead, ...inside, ...filed], elsewhere };
}
