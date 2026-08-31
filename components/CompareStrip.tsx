"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ChainGlyph from "@/components/ChainGlyph";
import { tileHue } from "@/lib/brand";
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
  other: { slug: string; name: string; glyph?: string };
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
              className="flex items-center gap-2 rounded-full border border-line py-1.5 pl-1.5 pr-3.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{
                  color: tileHue(link.other.slug),
                  background: `color-mix(in oklab, ${tileHue(link.other.slug)} 13%, var(--surface))`,
                }}
              >
                {link.other.glyph ? (
                  <ChainGlyph glyph={link.other.glyph} className="h-5 w-5" />
                ) : (
                  <span className="text-xs font-bold">{link.other.name[0]}</span>
                )}
              </span>
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
              className="flex h-10 items-center rounded-full border border-dashed border-line px-3.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg"
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
              className="w-full rounded-xl border border-line bg-surface py-2 pl-10 pr-4 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
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
                    className="rounded-full border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-fg"
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
