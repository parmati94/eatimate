"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ChainGlyph from "@/components/ChainGlyph";
import { tileHue } from "@/lib/brand";

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
  chainName,
  links,
}: {
  chainName: string;
  links: CompareLink[];
}) {
  const router = useRouter();
  if (!links.length) return null;

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
      </ul>
    </section>
  );
}
