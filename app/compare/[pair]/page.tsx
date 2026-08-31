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

async function load(slug: string) {
  const parsed = parsePair(slug);
  if (!parsed) return null;
  const [a, b] = parsed;
  const chains = await Promise.all([getChain(a), getChain(b)]);
  if (chains.some((c) => c === null)) return null;
  const dishes = await pairDishes(a, b);
  if (!dishes.length) return null;
  // Each dish becomes a starting point for the live comparison. The first is
  // what renders server-side, so it is the version that gets indexed.
  const presets: ComparePreset[] = dishes.map(({ dish, meals }) => ({
    id: dish.id,
    name: dish.name,
    rule: dish.rule,
    sides: meals.map((m) => m.selections),
  }));
  return { a: chains[0]!, b: chains[1]!, dishes, presets };
}

export async function generateMetadata(
  props: PageProps<"/compare/[pair]">,
): Promise<Metadata> {
  const { pair } = await props.params;
  const data = await load(pair);
  if (!data) return {};
  const { a, b, dishes } = data;
  const title = `${a.name} vs ${b.name}: Nutrition Compared`;
  const description = `Side-by-side calories, protein, carbs, fat and sodium for the same ${dishes
    .map((d) => d.dish.name.toLowerCase())
    .join(" and ")} built at ${a.name} and ${b.name}, from each chain's own published nutrition data.`;
  const url = `/compare/${pairSlug(a.slug, b.slug)}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · Eatimate`, description, url, type: "website", siteName: "Eatimate" },
    twitter: { card: "summary_large_image", title: `${title} · Eatimate`, description },
  };
}

export default async function ComparePage(props: PageProps<"/compare/[pair]">) {
  const { pair } = await props.params;
  const data = await load(pair);
  if (!data) notFound();
  const { a, b, presets } = data;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
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

      <div className="mt-6">
        <MealCompare chains={[a, b]} presets={presets} />
      </div>

      <footer className="mt-6 space-y-2 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <p>
          The starting builds are ours, not the chains&rsquo;. Neither
          restaurant sells a dish designed to line up against the other, so each
          one is the closest honest reading of the rule stated above it; where a
          menu cannot do what the rule asks, it says so. Nutrition figures come
          from{" "}
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
