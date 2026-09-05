import Link from "next/link";
import ChainMark from "@/components/ChainMark";
import type { Tint } from "@/lib/brand";
import type { ComparePair } from "@/lib/meals";

/** One available comparison, as a link. Shared by the homepage and /compare. */
export default function CompareCard({
  pair,
  tints,
}: {
  pair: ComparePair;
  tints: Map<string, Tint>;
}) {
  return (
    <Link
      href={`/compare/${pair.slug}`}
      className="group flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-fg/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
    >
      <div className="flex items-center gap-2">
        {pair.chains.map((c, i) => (
          <span key={c.slug} className="flex items-center gap-2">
            {i > 0 && <span className="text-xs text-muted">vs</span>}
            <ChainMark glyph={c.glyph} name={c.name} tint={tints.get(c.slug)!} />
          </span>
        ))}
      </div>
      <p className="text-sm font-semibold leading-tight">
        {pair.chains[0].name} vs {pair.chains[1].name}
      </p>
      <p className="text-xs text-muted">{pair.dishes.join(" · ")}</p>
    </Link>
  );
}

/** The same comparison as a chip, for a row of them under a dish heading. */
export function PairChip({
  pair,
  tints,
  dish,
}: {
  pair: ComparePair;
  tints: Map<string, Tint>;
  /** Which dish this chip sits under, so the pair page opens on that one
   *  rather than on whichever dish happens to sort first. A hash, not a query
   *  param: the route reads `params` and never `searchParams`, and touching
   *  searchParams here would opt the whole page out of static rendering. */
  dish?: string;
}) {
  return (
    <Link
      href={`/compare/${pair.slug}${dish ? `#${dish}` : ""}`}
      className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4 text-sm text-muted transition-colors hover:border-fg/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
    >
      <span className="flex items-center -space-x-1.5">
        {pair.chains.map((c) => (
          <ChainMark
            key={c.slug}
            glyph={c.glyph}
            name={c.name}
            tint={tints.get(c.slug)!}
            className="h-7 w-7 rounded-full ring-2 ring-surface"
            iconClassName="h-4.5 w-4.5"
          />
        ))}
      </span>
      <span>
        {pair.chains[0].name} <span className="text-xs">vs</span> {pair.chains[1].name}
      </span>
    </Link>
  );
}
