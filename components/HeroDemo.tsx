"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ChainMark from "./ChainMark";
import type { Tint } from "@/lib/brand";
import { NUTRIENT_FIELDS, type Totals } from "@/lib/schema";
import { show } from "@/lib/rounding";
import { possessive } from "@/lib/text";
import { IconCheck } from "./icons";

export type DemoStep = {
  name: string;
  /** Pieces or slices. Its scaling is already applied to `nutrients`; this is
   *  here so the row can say "x8" the way a builder row does. */
  qty: number;
  nutrients: Totals;
};

const START_MS = 200; // matches the CSS row stagger below
const REVEAL_MS = 420; // gap between rows, ditto
const COUNT_MS = 700; // how long one ingredient takes to land in the total

/** useLayoutEffect that does not warn during SSR. The reset to zero has to
 *  happen before the browser paints, or the final total flashes first. */
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const ZERO: Totals = Object.fromEntries(
  NUTRIENT_FIELDS.map((f) => [f, 0]),
) as Totals;

/** Totals at a moment in the sequence: each ingredient eases in over its own
 *  COUNT_MS, starting when its row lands, so the label and the checkmarks are
 *  telling the same story rather than two overlapping ones. */
function totalsAt(steps: DemoStep[], elapsed: number): Totals {
  const out = { ...ZERO };
  for (const [i, s] of steps.entries()) {
    const p = Math.min(
      1,
      Math.max(0, (elapsed - START_MS - i * REVEAL_MS) / COUNT_MS),
    );
    if (p === 0) continue;
    const eased = 1 - Math.pow(1 - p, 3);
    for (const f of NUTRIENT_FIELDS) out[f] += s.nutrients[f] * eased;
  }
  return out;
}

function sum(steps: DemoStep[]): Totals {
  const out = { ...ZERO };
  for (const s of steps) for (const f of NUTRIENT_FIELDS) out[f] += s.nutrients[f];
  return out;
}

/**
 * The homepage thesis: a total moving as you tap.
 *
 * The page used to describe that in a sentence. Showing it costs the same
 * vertical space and is the one thing about this product that a screenshot of
 * a competitor does not already have.
 *
 * Rows render server-side at their final state, so the HTML a crawler sees is
 * the finished bowl with real figures from the chain file. The reveal is a CSS
 * stagger over that markup (no JS state, so nothing can mismatch on hydration);
 * only the figures are animated in JS.
 *
 * Desktop gives the running total a column of its own rather than a second
 * pane. A full NutritionLabel was tried there and was the wrong call: it filled
 * the width, but it demoted the one number this card exists to show into a 13px
 * row among nine others. The label is the chain page's job.
 */
export default function HeroDemo({
  chain,
  steps,
  tint,
}: {
  chain: { slug: string; name: string; glyph?: string; dish: string };
  steps: DemoStep[];
  tint: Tint;
}) {
  const final = sum(steps);
  const [totals, setTotals] = useState<Totals>(final);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Zero it before the first client paint. Without this the server's final
  // total is painted, then replaced -- which on a fast desktop reads as the
  // number flashing rather than counting.
  useBeforePaint(() => {
    setTotals(ZERO);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let started = 0;
    const run = () => {
      // Deliberately NOT gated on prefers-reduced-motion. That setting exists
      // for movement -- parallax, sliding, zoom -- and the row reveal below
      // honours it in CSS. A figure changing in place moves nothing, and
      // suppressing it here left the one thing this card exists to show
      // invisible to anyone with the OS setting on.
      const tick = (t: number) => {
        if (!started) started = t;
        const elapsed = t - started;
        setTotals(totalsAt(steps, elapsed));
        const done = START_MS + (steps.length - 1) * REVEAL_MS + COUNT_MS;
        if (elapsed < done) raf = requestAnimationFrame(tick);
        else setTotals(final);
      };
      raf = requestAnimationFrame(tick);
    };

    // rAF does not tick in a background tab, so starting on mount meant that
    // opening the page in a new tab and switching to it landed on the final
    // number having animated nothing. Wait until the card is actually on a
    // visible screen.
    const start = () => {
      if (document.visibilityState !== "visible") return false;
      run();
      return true;
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (start()) io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(el);

    const onVisible = () => {
      if (start()) {
        io.disconnect();
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <div
      ref={ref}
      data-chain
      style={
        { "--chain-l": tint.light, "--chain-d": tint.dark } as CSSProperties
      }
      className="mx-auto w-full max-w-md lg:max-w-2xl"
    >
      <Link
        href={`/${chain.slug}`}
        className="group block rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5 lg:grid lg:grid-cols-[1fr_12rem] lg:items-stretch lg:gap-7 lg:p-6"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <ChainMark
              glyph={chain.glyph}
              name={chain.name}
              tint={tint}
              className="h-8 w-8 rounded-lg"
              iconClassName="h-6 w-6"
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {chain.name} {chain.dish}
            </span>
          </div>

          {/* Tighter on a phone: the card was the entire first screen there,
              with the restaurant search and the tiles starting below the
              fold. The rows still add up in front of you; they just sit
              closer. */}
          <ul className="mt-2.5 sm:mt-3 sm:space-y-0.5">
            {steps.map((s, i) => (
              <li
                key={s.name}
                style={{ "--i": i } as CSSProperties}
                className="motion-safe:animate-[demo-row_.5s_ease-out_both] flex items-center gap-2.5 py-0.5 [animation-delay:calc(var(--i)*.42s+.2s)] sm:py-1"
              >
                <span
                  aria-hidden
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
                >
                  <IconCheck className="h-2.5 w-2.5" />
                </span>
                {/* The quantity belongs to the item, not to a column of its
                    own: "Hand Tossed x2" is one thing, so it sits against the
                    name and stays ragged. Only the name truncates. */}
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="truncate text-sm">{s.name}</span>
                  {s.qty > 1 && (
                    <span className="num shrink-0 text-sm font-semibold text-accent-strong">
                      &times;{s.qty}
                    </span>
                  )}
                </span>
                {/* Fixed width, right-aligned: the figures are a column and
                    should read as one, the way the builder's rows do. */}
                <span className="num w-14 shrink-0 text-right text-xs text-muted">
                  {s.nutrients.calories} cal
                </span>
              </li>
            ))}
          </ul>

          {/* Mobile: the label's own device -- a heavy rule, then the number.
              Desktop moves the same figure into the column beside this one, so
              the rule turns from horizontal into the vertical divider there. */}
          <div className="mt-3 flex items-baseline justify-between border-t-[6px] border-fg pt-1.5 lg:hidden">
            <span className="num text-sm font-bold">Calories</span>
            <span className="num text-4xl font-extrabold leading-none tracking-tight text-brand-strong">
              {show(totals.calories)}
            </span>
          </div>

          <p className="mt-2.5 text-xs text-muted">
            Every figure from {possessive(chain.name)} published data.{" "}
            <span className="whitespace-nowrap font-medium text-accent-strong underline decoration-transparent underline-offset-2 transition-colors group-hover:decoration-current">
              Build your own →
            </span>
          </p>
        </div>

        <div className="hidden lg:flex lg:h-full lg:flex-col lg:justify-center lg:self-stretch lg:border-l lg:border-line lg:pl-7">
          <span className="num text-sm font-bold">Calories</span>
          <span className="num text-6xl font-extrabold leading-none tracking-tighter text-brand-strong">
            {show(totals.calories)}
          </span>
          <span className="num mt-2 whitespace-nowrap text-xs leading-relaxed text-muted">
            {show(totals.protein_g, 1)}g protein
            <br />
            {show(totals.carbs_g, 1)}g carbs · {show(totals.fat_g, 1)}g fat
          </span>
        </div>
      </Link>
    </div>
  );
}
