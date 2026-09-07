"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { useSearchMiss } from "@/lib/search-miss";
import { findChains } from "@/lib/text";
import ChainMark from "./ChainMark";
import type { Tint } from "@/lib/brand";
import { IconSearch } from "./icons";

export type ChainCard = {
  slug: string;
  name: string;
  glyph?: string;
  /** What the chain sells, in a customer's words. */
  formats?: string[];
  /** What people type for it that the name does not contain: "BWW". */
  aliases?: string[];
  tint: Tint;
};

export default function ChainSearch({ chains }: { chains: ChainCard[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Name and alias first, then what the chain sells: "pizza" used to be a
  // logged missing restaurant on a site with three pizza chains, and so did
  // "bww" and "5 guys". lib/text.ts squashes spelling, so is "chick fil a".
  const shown = findChains(q, chains);
  const go = (chain: ChainCard) => {
    track("chain-picked", {
      chain: chain.slug,
      from: q.trim() ? "search" : "list",
    });
  };

  // A restaurant somebody looked for and we do not have. The most directly
  // actionable thing the site can learn: it names the next chain to ingest,
  // from the people who wanted it rather than from a guess.
  useSearchMiss(q, shown.length === 0, { scope: "chains" });

  return (
    <div>
      <label className="relative block">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search restaurants…"
          aria-label="Search restaurants"
          // Enter opens the best match. The field already narrows the grid,
          // but on a phone the grid is below the keyboard, and "sub" + Enter
          // is how a search box is expected to behave.
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !q.trim() || shown.length === 0) return;
            e.preventDefault();
            go(shown[0]);
            router.push(`/${shown[0].slug}`);
          }}
          className="w-full rounded-2xl border border-line bg-surface py-4 pl-12 pr-5 text-lg shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </label>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        {shown.map((chain) => (
          <li key={chain.slug}>
            <Link
              href={`/${chain.slug}`}
              // The first step of the funnel. Without it a session that landed
              // on the picker and left is indistinguishable from one that went
              // somewhere, and "from" says whether the field earns its place.
              onClick={() => go(chain)}
              className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-fg/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
            >
              <ChainMark
                glyph={chain.glyph}
                name={chain.name}
                tint={chain.tint}
                className="h-14 w-14 rounded-2xl"
                iconClassName="h-11 w-11"
              />
              <span className="font-semibold leading-tight">{chain.name}</span>
              {chain.formats && (
                <span className="text-xs text-muted">
                  {chain.formats.join(" · ")}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-8 text-center text-muted">
          No restaurant matching “{q}” yet.{" "}
          <a
            href="https://github.com/parmati94/eatimate/issues/new"
            rel="noopener"
            className="underline decoration-line underline-offset-4 hover:text-fg"
          >
            Ask for it
          </a>
          .
        </p>
      )}
    </div>
  );
}
