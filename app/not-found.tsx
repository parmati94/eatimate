import type { Metadata } from "next";
import { chainTints, listChains } from "@/lib/data";
import ChainSearch from "@/components/ChainSearch";

export const metadata: Metadata = { title: "Not found" };

/**
 * A wrong address, answered with the restaurant list.
 *
 * Next's own page said "This page could not be found" over nothing tappable.
 * The addresses that reach here are guesses -- a chain we do not have, a
 * mistyped slug, an old comparison link -- and the visitor behind a guess
 * wanted a restaurant, so this offers all of them, with the same search the
 * homepage has.
 */
export default async function NotFound() {
  const [chains, tints] = await Promise.all([listChains(), chainTints()]);
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-10 sm:pt-16">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Nothing at this address
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          That link may be out of date, or it names a restaurant we don&apos;t
          have yet. Every calculator on the site is below.
        </p>
      </div>
      <div className="mt-8">
        <ChainSearch
          chains={chains.map((c) => ({
            slug: c.slug,
            name: c.name,
            glyph: c.glyph,
            formats: c.formats,
            aliases: c.aliases,
            tint: tints.get(c.slug)!,
          }))}
        />
      </div>
    </main>
  );
}
