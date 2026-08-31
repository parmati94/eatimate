import type { Metadata } from "next";
import ChainPicker from "@/components/ChainPicker";
import CompareCard from "@/components/CompareCard";
import { chainTints, listChains } from "@/lib/data";
import { listComparePairs } from "@/lib/meals";

export const metadata: Metadata = {
  title: { absolute: "Compare Restaurant Nutrition Side by Side" },
  description:
    "Build the same order at two chains and see the calorie, protein, carb, fat and sodium difference — every figure from each chain's own published nutrition data.",
  alternates: { canonical: "/compare" },
};

export default async function CompareIndex() {
  const [pairs, chains, tints] = await Promise.all([
    listComparePairs(),
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
        move. Compared as served — portions differ between chains, and that
        difference is part of the answer.
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

      {/* The explainer that used to sit under this heading ("...so there is
          something to read before you touch anything") described the reader's
          experience rather than telling them anything. The heading says it. */}
      <h2 className="mt-10 text-lg font-bold tracking-tight">
        Recommended — already built at both
      </h2>

      {pairs.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No comparisons yet.</p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {pairs.map((p) => (
            <li key={p.slug}>
              <CompareCard pair={p} tints={tints} />
            </li>
          ))}
        </ul>
      )}

      {/* The pair pages carry the full version of this note against the build
          it actually describes. Here it is one line. */}
      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-muted">
        Starting builds are ours, not the chains&rsquo; — and every ingredient
        is yours to change.
      </p>
    </main>
  );
}
