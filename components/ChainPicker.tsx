"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ChainGlyph from "@/components/ChainGlyph";
import { IconSearch, IconX } from "@/components/icons";
import { tileHue } from "@/lib/brand";
import { pairSlug } from "@/lib/compare";

export interface PickableChain {
  slug: string;
  name: string;
  glyph?: string;
}

function Chip({ chain, onClear }: { chain: PickableChain; onClear: () => void }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-accent bg-surface py-2 pl-2 pr-2.5 text-sm font-semibold">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{
          color: tileHue(chain.slug),
          background: `color-mix(in oklab, ${tileHue(chain.slug)} 13%, var(--surface))`,
        }}
      >
        {chain.glyph ? <ChainGlyph glyph={chain.glyph} className="h-5 w-5" /> : chain.name[0]}
      </span>
      {chain.name}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${chain.name}`}
        className="text-muted hover:text-fg"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * Pick any two chains and go.
 *
 * Deliberately unconstrained: nothing stops a pizza being compared with a
 * salad. The pairs we *recommend* are the ones with a written starting build,
 * and those are surfaced separately — but refusing to run someone's comparison
 * because we think it is a strange one would just be us in their way.
 */
export default function ChainPicker({ chains }: { chains: PickableChain[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<PickableChain[]>([]);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const taken = new Set(picked.map((c) => c.slug));
    return chains
      .filter((c) => !taken.has(c.slug))
      .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  }, [chains, picked, q]);

  const pick = (c: PickableChain) => {
    const next = [...picked, c];
    setQ("");
    if (next.length === 2) {
      router.push(`/compare/${pairSlug(next[0].slug, next[1].slug)}`);
      return;
    }
    setPicked(next);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <p className="text-sm font-semibold">
        {picked.length === 0 ? "Pick two chains" : `Now pick one to compare with ${picked[0].name}`}
      </p>

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {picked.map((c) => (
            <Chip key={c.slug} chain={c} onClear={() => setPicked([])} />
          ))}
        </div>
      )}

      <label className="relative mt-3 block">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search restaurants…"
          aria-label="Search restaurants to compare"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-4 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </label>

      {shown.length === 0 ? (
        <p className="mt-3 text-xs text-muted">No restaurant matches that.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {shown.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg"
              >
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    color: tileHue(c.slug),
                    background: `color-mix(in oklab, ${tileHue(c.slug)} 13%, var(--surface))`,
                  }}
                >
                  {c.glyph ? <ChainGlyph glyph={c.glyph} className="h-5 w-5" /> : c.name[0]}
                </span>
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
