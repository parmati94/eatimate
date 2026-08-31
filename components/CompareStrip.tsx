"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ChainMark from "@/components/ChainMark";
import type { Tint } from "@/lib/brand";
import { pairSlug } from "@/lib/compare";
import { useState } from "react";
import { IconSearch } from "@/components/icons";

/** Only what the strip draws — the full Chain objects would serialise hundreds
 *  of components into the client payload for a row of links. */
export interface CompareLink {
  href: string;
  /** Which side of that comparison this chain is, so a meal in progress lands
   *  in the right column. */
  side: "a" | "b";
  other: { slug: string; name: string; glyph?: string; tint: Tint };
}

/**
 * "How does this stack up against…" on a chain's own page.
 *
 * The highest-intent placement on the site, and the internal link that lets a
 * crawler reach the comparison pages at all. The href is a plain static link
 * for exactly that reason; the click handler only enriches it when there is a
 * meal in progress, so a half-built order carries over instead of being
 * retyped on the other side.
 */
export default function CompareStrip({
  chain,
  links,
  others,
}: {
  chain: { slug: string; name: string };
  /** Pairs with a written starting build — the ones worth suggesting. */
  links: CompareLink[];
  /** Every other chain, reachable but not recommended. */
  others: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chainName = chain.name;

  const carryMeal = (link: CompareLink) => (e: React.MouseEvent) => {
    // The builder debounces its URL write, so read at click time, not render.
    const q = new URLSearchParams(window.location.search);
    const m = q.get("m");
    if (!m) return; // nothing built yet: the plain href is already right
    e.preventDefault();
    const next = new URLSearchParams({ [link.side]: m });
    const portion = q.get("p");
    if (portion) next.set(link.side === "a" ? "pa" : "pb", portion);
    router.push(`${link.href}?${next}`);
  };

  const matches = others.filter((o) =>
    o.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  /** Same meal handoff, for a pair with no written starting build. */
  const goAnywhere = (otherSlug: string) => () => {
    const href = `/compare/${pairSlug(chain.slug, otherSlug)}`;
    const q2 = new URLSearchParams(window.location.search);
    const m = q2.get("m");
    if (!m) return router.push(href);
    const side = chain.slug < otherSlug ? "a" : "b";
    const next = new URLSearchParams({ [side]: m });
    const portion = q2.get("p");
    if (portion) next.set(side === "a" ? "pa" : "pb", portion);
    router.push(`${href}?${next}`);
  };

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">How does {chainName} compare?</h2>
      <p className="mt-0.5 text-xs text-muted">
        Your order comes with you — build it at both and see the difference.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={carryMeal(link)}
              className="flex min-h-11 items-center gap-2 rounded-full border border-line py-2 pl-2 pr-4 text-sm text-muted transition-colors hover:border-fg/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
            >
              <ChainMark
                glyph={link.other.glyph}
                name={link.other.name}
                tint={link.other.tint}
                className="h-7 w-7 rounded-full"
                iconClassName="h-5 w-5"
              />
              vs {link.other.name}
            </Link>
          </li>
        ))}
        {others.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex min-h-11 items-center rounded-full border border-dashed border-line px-4 text-sm text-muted transition-colors hover:border-fg/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
            >
              {open ? "Close" : "vs any other chain"}
            </button>
          </li>
        )}
      </ul>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <label className="relative block">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search restaurants…"
              aria-label={`Search a restaurant to compare with ${chainName}`}
              className="w-full rounded-xl border border-line bg-surface py-2 pl-10 pr-4 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          {matches.length === 0 ? (
            <p className="mt-2 text-xs text-muted">No restaurant matches that.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {matches.map((o) => (
                <li key={o.slug}>
                  <button
                    type="button"
                    onClick={goAnywhere(o.slug)}
                    className="min-h-11 rounded-full border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-fg/30 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                  >
                    vs {o.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
