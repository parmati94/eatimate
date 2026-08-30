"use client";

import Link from "next/link";
import { useState } from "react";
import ChainGlyph from "./ChainGlyph";
import { IconSearch } from "./icons";

export type ChainCard = {
  slug: string;
  name: string;
  glyph?: string;
  componentCount: number;
  retrieved: string;
};

// Deterministic tile hue per chain (no trademarked logos/colors); rendered
// as a tinted ground with the hue carried by the food glyph.
const PALETTE = [
  "#0d9488",
  "#0284c7",
  "#d97706",
  "#e11d48",
  "#7c3aed",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
];

function tileHue(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return PALETTE[h % PALETTE.length];
}

export default function ChainSearch({ chains }: { chains: ChainCard[] }) {
  const [q, setQ] = useState("");
  const shown = q
    ? chains.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    : chains;

  return (
    <div>
      <label className="relative block">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search restaurants…"
          aria-label="Search restaurants"
          className="w-full rounded-2xl border border-line bg-surface py-4 pl-12 pr-5 text-lg shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
      </label>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        {shown.map((chain) => (
          <li key={chain.slug}>
            <Link
              href={`/${chain.slug}`}
              className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:border-accent focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="flex h-14 w-14 items-center justify-center rounded-2xl border"
                style={{
                  color: tileHue(chain.slug),
                  background: `color-mix(in oklab, ${tileHue(chain.slug)} 13%, var(--surface))`,
                  borderColor: `color-mix(in oklab, ${tileHue(chain.slug)} 25%, var(--line))`,
                }}
              >
                {chain.glyph ? (
                  <ChainGlyph glyph={chain.glyph} />
                ) : (
                  <span className="text-2xl font-bold">{chain.name[0]}</span>
                )}
              </span>
              <span className="font-semibold leading-tight">{chain.name}</span>
              <span className="text-xs text-muted">
                {chain.componentCount} ingredients
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-8 text-center text-muted">
          Nothing for “{q}” yet — restaurant requests are coming with the public
          version.
        </p>
      )}
    </div>
  );
}
