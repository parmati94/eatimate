import type { Metadata } from "next";
import CompareCard from "@/components/CompareCard";
import { listComparePairs } from "@/lib/meals";

export const metadata: Metadata = {
  title: { absolute: "Compare Restaurant Nutrition Side by Side" },
  description:
    "Build the same order at two chains and see the calorie, protein, carb, fat and sodium difference — every figure from each chain's own published nutrition data.",
  alternates: { canonical: "/compare" },
};

export default async function CompareIndex() {
  const pairs = await listComparePairs();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Compare two chains
      </h1>
      <p className="mt-3 max-w-2xl text-base text-muted">
        Build the same order at both, side by side, and watch the difference
        move. Compared as served — portions differ between chains, and that
        difference is part of the answer.
      </p>

      {pairs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No comparisons yet.</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {pairs.map((p) => (
            <li key={p.slug}>
              <CompareCard pair={p} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-muted">
        Comparisons start from a build of ours, not the chains&rsquo;. No
        restaurant sells a dish designed to line up against another&rsquo;s, so
        each starting point is the closest honest reading of a rule stated on
        the page, and every ingredient is yours to change.
      </p>
    </main>
  );
}
