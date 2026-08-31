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
