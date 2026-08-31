import Link from "next/link";
import ChainGlyph from "@/components/ChainGlyph";
import { tileHue } from "@/lib/brand";
import type { ComparePair } from "@/lib/meals";

/** One available comparison, as a link. Shared by the homepage and /compare. */
export default function CompareCard({ pair }: { pair: ComparePair }) {
  return (
    <Link
      href={`/compare/${pair.slug}`}
      className="group flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:border-accent focus-visible:outline-none"
    >
      <div className="flex items-center gap-2">
        {pair.chains.map((c, i) => (
          <span key={c.slug} className="flex items-center gap-2">
            {i > 0 && <span className="text-xs text-muted">vs</span>}
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                color: tileHue(c.slug),
                background: `color-mix(in oklab, ${tileHue(c.slug)} 13%, var(--surface))`,
              }}
            >
              {c.glyph ? (
                <ChainGlyph glyph={c.glyph} className="h-6 w-6" />
              ) : (
                <span className="text-sm font-bold">{c.name[0]}</span>
              )}
            </span>
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
