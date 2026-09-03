import type { Metadata } from "next";
import ChainPicker from "@/components/ChainPicker";
import { PairChip } from "@/components/CompareCard";
import { chainTints, listChains } from "@/lib/data";
import { listDishGroups } from "@/lib/meals";

export const metadata: Metadata = {
  title: { absolute: "Compare Restaurant Nutrition Side by Side" },
  description:
    "Build the same order at two chains and see the calorie, protein, carb, fat and sodium difference — every figure from each chain's own published nutrition data.",
  alternates: { canonical: "/compare" },
};

export default async function CompareIndex() {
  const [groups, chains, tints] = await Promise.all([
    listDishGroups(),
    listChains(),
    chainTints(),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Compare two chains
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted">
        Build the same order at both, side by side, and watch the difference
        move.
      </p>

      <div className="mt-6">
        <ChainPicker
          chains={chains.map((c) => ({
            slug: c.slug,
            name: c.name,
            glyph: c.glyph,
            tint: tints.get(c.slug)!,
          }))}
        />
      </div>

      {/* By dish, not by pair. Thirty-three cards in alphabetical order put
          every "Burger King vs …" first and grew with the square of each
          cluster; one heading per dish grows by a line per chain and names
          the question rather than the permutation. */}
      <h2 className="mt-10 text-lg font-bold tracking-tight">
        Recommended, by dish
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Each of these opens with the dish already built at both chains. Pick
        any two.
      </p>

      {groups.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No comparisons yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-line">
          {groups.map(({ dishes, chains: at, pairs }) => (
            <section key={dishes[0].id} className="py-5 first:pt-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-base font-semibold">
                  {dishes.map((d) => d.name).join(" · ")}
                </h3>
                <p className="text-xs text-muted">
                  at {at.length} chains
                </p>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {pairs.map((p) => (
                  <li key={p.slug}>
                    <PairChip pair={p} tints={tints} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* The pair pages carry the full version of this note against the build
          it actually describes. Here it is one line. */}
      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-muted">
        Compared as served, not per 100 g — portions differ between chains, and
        that difference is part of the answer. Starting builds are ours, not
        the chains&rsquo;, and every ingredient is yours to change.
      </p>
    </main>
  );
}
