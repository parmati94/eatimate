import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MealCompare, { type ComparePreset } from "@/components/MealCompare";
import { getChain } from "@/lib/data";
import { listPairs, pairDishes, pairSlug, parsePair } from "@/lib/meals";

// Both orderings are generated, because "chipotle vs cava" and "cava vs
// chipotle" are both things people type. Only the alphabetical one is
// canonical, so the mirror does not compete with it in search.
export async function generateStaticParams() {
  const pairs = await listPairs();
  return pairs.flatMap(([a, b]) => [
    { pair: `${a}-vs-${b}` },
    { pair: `${b}-vs-${a}` },
  ]);
}

/**
 * Any two real chains can be compared; only some are *recommended*.
 *
 * A pair with a shared dish gets a starting build, is prerendered, sits in the
 * sitemap and is indexed. Every other pair still works — it just opens empty
 * and is left out of search. Indexing all 105 pairs would add ~200 thin,
 * near-identical pages to a site with twenty good ones, which costs more in
 * quality signal than the long tail could ever return.
 */
async function load(slug: string) {
  const parsed = parsePair(slug);
  if (!parsed) return null;
  const [a, b] = parsed;
  const chains = await Promise.all([getChain(a), getChain(b)]);
  if (chains.some((c) => c === null)) return null; // an unknown chain is still a 404
  const dishes = await pairDishes(a, b);
  // Each dish becomes a starting point for the live comparison. The first is
  // what renders server-side, so it is the version that gets indexed.
  const presets: ComparePreset[] = dishes.map(({ dish, meals }) => ({
    id: dish.id,
    name: dish.name,
    rule: dish.rule,
    sides: meals.map((m) => m.selections),
    portions: meals.map((m) => m.build.portion ?? 1),
  }));
  return {
    a: chains[0]!,
    b: chains[1]!,
    presets,
    recommended: dishes.length > 0,
  };
}

export async function generateMetadata(
  props: PageProps<"/compare/[pair]">,
): Promise<Metadata> {
  const { pair } = await props.params;
  const data = await load(pair);
  if (!data) return {};
  const { a, b, presets, recommended } = data;
  const title = `${a.name} vs ${b.name}: Nutrition Compared`;
  const description = recommended
    ? `Side-by-side calories, protein, carbs, fat and sodium for the same ${presets
        .map((p) => p.name.toLowerCase())
        .join(" and ")} built at ${a.name} and ${b.name}, from each chain's own published nutrition data.`
    : `Build a ${a.name} order and a ${b.name} order side by side and compare calories, protein, carbs, fat and sodium.`;
  const url = `/compare/${pairSlug(a.slug, b.slug)}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // follow, so the links out of an unrecommended pair still carry weight.
    ...(recommended ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: `${title} · Eatimate`, description, url, type: "website", siteName: "Eatimate" },
    twitter: { card: "summary_large_image", title: `${title} · Eatimate`, description },
  };
}

export default async function ComparePage(props: PageProps<"/compare/[pair]">) {
  const { pair } = await props.params;
  const data = await load(pair);
  if (!data) notFound();
  const { a, b, presets, recommended } = data;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:pt-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        {a.name} vs {b.name}{" "}
        <span className="font-semibold text-muted">Nutrition Compared</span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Build both orders side by side and watch the difference move. Compared
        as served, not per 100 g — portions differ between chains, and that
        difference is part of the answer. Every figure is each chain&rsquo;s own
        published data.
      </p>

      {!recommended && (
        // Says why the page is empty. Two chains that sell nothing alike have
        // no honest starting build, and inventing one would be worse than none.
        <p className="mt-3 max-w-2xl rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
          These two don&rsquo;t sell anything alike enough for us to suggest a
          starting order, so both sides start empty — build whatever you like.
        </p>
      )}

      <div className="mt-6">
        <MealCompare chains={[a, b]} presets={presets} />
      </div>

      <footer className="mt-6 space-y-2 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <p>
          {recommended &&
            "The starting builds are ours, not the chains’. Neither restaurant sells a dish designed to line up against the other, so each one is the closest honest reading of the rule stated above it. "}
          Nutrition figures come from{" "}
          {[a, b].map((c, i) => (
            <span key={c.slug}>
              {i > 0 && " and "}
              <a
                href={c.source.pdf_url ?? c.source.html_url!}
                className="underline decoration-line underline-offset-2 hover:text-fg"
                rel="nofollow noopener"
              >
                {c.name}&rsquo;s published data
              </a>{" "}
              (retrieved {c.source.retrieved})
            </span>
          ))}
          . Not affiliated with or endorsed by either chain.
        </p>
        <p>
          One chain at a time:{" "}
          <Link href={`/${a.slug}`} className="underline decoration-line underline-offset-2 hover:text-fg">
            {a.name} calculator
          </Link>{" "}
          ·{" "}
          <Link href={`/${b.slug}`} className="underline decoration-line underline-offset-2 hover:text-fg">
            {b.name} calculator
          </Link>
        </p>
      </footer>
    </main>
  );
}
