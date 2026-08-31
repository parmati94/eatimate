import type { Metadata } from "next";
import Link from "next/link";
import { listChains } from "@/lib/data";
import { listComparePairs } from "@/lib/meals";
import ChainSearch from "@/components/ChainSearch";
import CompareCard from "@/components/CompareCard";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const chains = await listChains();
  const pairs = await listComparePairs();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-12 sm:pt-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Build the meal. <span className="text-accent-strong">Know the numbers.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base text-muted sm:text-lg">
          Pick your ingredients, get exact calories and macros — every number
          from the chain’s official nutrition data.
        </p>
      </div>

      <div className="mt-8 sm:mt-10">
        <ChainSearch
          chains={chains.map((c) => ({
            slug: c.slug,
            name: c.name,
            glyph: c.glyph,
            componentCount: c.components.length,
            retrieved: c.source.retrieved,
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
                <CompareCard pair={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12 text-center text-xs text-muted">
        Every number traced to the chain&rsquo;s official nutrition data
      </p>
    </main>
  );
}
