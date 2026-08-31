import type { Metadata } from "next";
import { listChains } from "@/lib/data";
import ChainSearch from "@/components/ChainSearch";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const chains = await listChains();

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

      <p className="mt-12 text-center text-xs text-muted">
        Every number traced to the chain&rsquo;s official nutrition data
      </p>
    </main>
  );
}
