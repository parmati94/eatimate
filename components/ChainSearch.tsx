"use client";

import Link from "next/link";
import { useState } from "react";

export type ChainCard = {
  slug: string;
  name: string;
  componentCount: number;
  retrieved: string;
};

// Deterministic pleasant tile color per chain (no trademarked logos/colors).
const PALETTE = [
  "bg-emerald-600",
  "bg-sky-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-violet-600",
  "bg-teal-600",
  "bg-orange-600",
  "bg-indigo-600",
];

function tileColor(slug: string): string {
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
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a restaurant…"
        aria-label="Search a restaurant"
        className="w-full rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-lg shadow-sm outline-none transition-colors focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900"
      />

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((chain) => (
          <li key={chain.slug}>
            <Link
              href={`/${chain.slug}`}
              className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span
                aria-hidden
                className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white ${tileColor(chain.slug)}`}
              >
                {chain.name[0]}
              </span>
              <span className="font-semibold leading-tight">{chain.name}</span>
              <span className="text-xs text-neutral-500">
                {chain.componentCount} ingredients
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-8 text-center text-neutral-500">
          Nothing for “{q}” yet — restaurant requests are coming with the public
          version.
        </p>
      )}
    </div>
  );
}
