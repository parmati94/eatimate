import type { Metadata } from "next";
import Link from "next/link";
import { chainTints, getChain, listChains } from "@/lib/data";
import { listComparePairs } from "@/lib/meals";
import ChainSearch from "@/components/ChainSearch";
import CompareCard from "@/components/CompareCard";
import HeroDemo, { type DemoStep } from "@/components/HeroDemo";
import { NUTRIENT_FIELDS, type Totals } from "@/lib/schema";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// The hero rotates daily rather than per request. Random-per-request would
// force this page dynamic -- it is the most-linked page on the site and is
// worth keeping prerendered -- and would show crawlers different content on
// every fetch. Randomising after hydration instead would swap the card's
// contents in front of the one visitor watching it.
export const revalidate = 86400;

/**
 * The meals the hero can build. Component ids and quantities, never figures:
 * every number is read out of the chain file, so the demo cannot drift from
 * the calculator it is advertising.
 *
 * Chosen for one FORMAT each -- bowl, pizza, wings, sub, burger. A rotation of
 * five burrito bowls would say nothing; this one quietly says the site covers
 * more than bowls, which is the only real reason to rotate at all.
 */
type Demo = {
  slug: string;
  dish: string;
  components: { id: string; qty?: number }[];
};

const DEMOS: Demo[] = [
  {
    slug: "chipotle",
    dish: "burrito bowl",
    components: [
      { id: "cilantro-lime-white-rice" },
      { id: "black-beans" },
      { id: "chicken" },
      { id: "fresh-tomato-salsa" },
      { id: "cheese" },
    ],
  },
  {
    // Domino's publishes per slice, and its slices-eaten control scales exactly
    // these four categories -- so a quantity of 2 on each row is the same
    // arithmetic the builder does, not an approximation of it.
    slug: "dominos",
    dish: "2 slices, pepperoni",
    components: [
      { id: "hand-tossed-md-hand", qty: 2 },
      { id: "pizza-sauce-md-hand", qty: 2 },
      { id: "regular-cheese-with-other-toppings-md-hand", qty: 2 },
      { id: "pepperoni-md-hand", qty: 2 },
    ],
  },
  {
    slug: "wingstop",
    dish: "8 wings, lemon pepper",
    components: [
      { id: "lemon-pepper", qty: 8 },
      { id: "seasoned-fries-regular-10-oz" },
      { id: "ranch-dip" },
      { id: "veggie-sticks-celery" },
    ],
  },
  {
    slug: "subway",
    dish: "6″ turkey sub",
    components: [
      { id: "6-artisan-italian-bread" },
      { id: "oven-roasted-turkey" },
      { id: "provolone" },
      { id: "lettuce" },
      { id: "tomatoes-3-wheels" },
    ],
  },
  {
    slug: "fiveguys",
    dish: "cheeseburger",
    components: [
      { id: "bun" },
      { id: "hamburger-patty" },
      { id: "cheese-slice" },
      { id: "lettuce" },
      { id: "tomatoes" },
    ],
  },
];

/** Resolves one preset against the chain files, or null if it no longer fits
 *  the data — a renamed component id must drop the meal, never quietly total a
 *  meal that is missing an ingredient. */
async function resolve(d: Demo) {
  const chain = await getChain(d.slug);
  if (!chain) return null;
  const steps: DemoStep[] = [];
  for (const { id, qty = 1 } of d.components) {
    const c = chain.components.find((x) => x.id === id);
    if (!c) return null;
    // Every nutrient, not just calories: the macro line beside the total is
    // read from these. A component missing one (cholesterol is the nullable
    // field) drops the meal rather than showing a total that reads complete.
    const nutrients = {} as Totals;
    for (const f of NUTRIENT_FIELDS) {
      const v = c[f];
      if (typeof v !== "number") return null;
      nutrients[f] = v * qty;
    }
    steps.push({ name: c.name, qty, nutrients });
  }
  return {
    chain: {
      slug: chain.slug,
      name: chain.name,
      glyph: chain.glyph,
      dish: d.dish,
    },
    steps,
  };
}

/** Today's meal. Deterministic from the date in UTC, so a given day renders the
 *  same card everywhere and the page stays cacheable. Falls through to the next
 *  preset if one no longer resolves — a single stale id should cost one meal,
 *  not the whole hero. */
async function demo() {
  const day = Math.floor(Date.now() / 86_400_000);
  for (let i = 0; i < DEMOS.length; i++) {
    const picked = await resolve(DEMOS[(day + i) % DEMOS.length]);
    if (picked) return picked;
  }
  return null;
}

export default async function Home() {
  const [chains, pairs, tints, hero] = await Promise.all([
    listChains(),
    listComparePairs(),
    chainTints(),
    demo(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-10 sm:pt-16">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Build the meal. <span className="text-brand-strong">Know the numbers.</span>
        </h1>
      </div>

      {/* The thesis, shown rather than described -- this replaced a sentence
          that said the same thing. */}
      {hero && (
        <div className="mt-6 sm:mt-9 lg:mt-11">
          <HeroDemo
            chain={hero.chain}
            steps={hero.steps}
            tint={tints.get(hero.chain.slug)!}
          />
        </div>
      )}

      <div className="mt-10 sm:mt-12">
        <ChainSearch
          chains={chains.map((c) => ({
            slug: c.slug,
            name: c.name,
            glyph: c.glyph,
            formats: c.formats,
            tint: tints.get(c.slug)!,
          }))}
        />
      </div>

      {pairs.length > 0 && (
        <section className="mt-14 border-t border-line pt-10">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                Or compare two chains
              </h2>
              <p className="mt-1 text-sm text-muted">
                The same order, built at both, side by side.
              </p>
            </div>
            {pairs.length > 4 && (
              <Link
                href="/compare"
                className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-fg"
              >
                All comparisons
              </Link>
            )}
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {pairs.slice(0, 4).map((p) => (
              <li key={p.slug}>
                <CompareCard pair={p} tints={tints} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
