"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import CompareTable from "@/components/CompareTable";
import MealBuilder from "@/components/MealBuilder";
import type { Tint } from "@/lib/brand";
import ChainMark from "./ChainMark";
import { copyText } from "@/lib/clipboard";
import { compareRows, fmtNutrient } from "@/lib/compare";
import {
  activeSizeMode,
  encodeMeal,
  estimatedNutrients,
  mealTotals,
  unknownNutrients,
  type Selections,
} from "@/lib/meal";
import type { Chain } from "@/lib/schema";
import { show } from "@/lib/rounding";
import { IconCheck, IconCopy, IconExternal } from "@/components/icons";
import { NUTRIENT_LABELS } from "@/lib/schema";

/** A named starting point: the same dish as each chain would build it. */
export interface ComparePreset {
  id: string;
  name: string;
  rule: string;
  /** One selection set per side, in the same order as `chains`. */
  sides: Selections[];
  /** How much of each built item the starting build eats — 2 slices of a
   *  pizza, say. Without this a pizza preset shows per-slice totals. */
  portions: number[];
}

const URL_SYNC_DELAY_MS = 600;

export default function MealCompare({
  chains,
  tints,
  presets,
}: {
  chains: [Chain, Chain];
  /** Each chain's colour, in the same order. Resolved on the server, because
   *  a shade depends on the whole roster. */
  tints: [Tint, Tint];
  presets: ComparePreset[];
}) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const [selections, setSelections] = useState<[Selections, Selections]>([
    preset?.sides[0] ?? {},
    preset?.sides[1] ?? {},
  ]);
  const [portions, setPortions] = useState<[number, number]>([
    preset?.portions[0] ?? 1,
    preset?.portions[1] ?? 1,
  ]);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const hydrated = useRef(false);

  // Restore a shared comparison from ?a=&b= after mount, the same way the
  // single-chain builder restores ?m=. SSR renders the preset, which is what
  // gets indexed; a pasted link then replaces it on the client.
  useEffect(() => {
    // Same exception as the single-chain builder: restoring a shared link once
    // on mount is the one thing this rule cannot express, because a lazy
    // initialiser cannot read window during SSR without a hydration mismatch.
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search);
    const [a, b] = [q.get("a"), q.get("b")];
    if (a || b) {
      setSelections((prev) => [
        a ? decode(a, chains[0]) : prev[0],
        b ? decode(b, chains[1]) : prev[1],
      ]);
    }
    // Portion travels with the meal. A Papa John's build arriving without it
    // would silently show whole-pizza totals for two slices.
    const p = [q.get("pa"), q.get("pb")].map((v) => Number(v));
    if (p.some((n) => Number.isInteger(n) && n > 1)) {
      setPortions((prev) => [
        Number.isInteger(p[0]) && p[0] > 1 ? p[0] : prev[0],
        Number.isInteger(p[1]) && p[1] > 1 ? p[1] : prev[1],
      ]);
    }
    hydrated.current = true;
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One writer for both sides. Debounced for the same reason the builder is:
  // Cloudflare's analytics counts every replaceState as a pageview.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      const url = new URL(window.location.href);
      for (const [i, key] of (["a", "b"] as const).entries()) {
        const enc = encodeMeal(selections[i]);
        if (enc) url.searchParams.set(key, enc);
        else url.searchParams.delete(key);
        const pk = key === "a" ? "pa" : "pb";
        if (portions[i] > 1) url.searchParams.set(pk, String(portions[i]));
        else url.searchParams.delete(pk);
      }
      if (url.href !== window.location.href) {
        window.history.replaceState(null, "", url.href);
      }
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [selections, portions]);

  const facts = useMemo(
    () =>
      chains.map((chain, i) => {
        const sel = selections[i];
        const mode = activeSizeMode(chain, sel);
        return {
          totals: mealTotals(chain, sel, mode, portions[i]),
          unknown: unknownNutrients(chain, sel),
          estimated: estimatedNutrients(chain, sel),
        };
      }),
    [chains, selections, portions],
  );
  const rows = useMemo(() => compareRows(facts), [facts]);
  const names = chains.map((c) => c.name);
  const empty = selections.every((s) => Object.keys(s).length === 0);

  const setSide = (i: 0 | 1) => (update: React.SetStateAction<Selections>) =>
    setSelections((prev) => {
      const next: [Selections, Selections] = [prev[0], prev[1]];
      next[i] = typeof update === "function" ? update(prev[i]) : update;
      return next;
    });
  const setSidePortion = (i: 0 | 1) => (update: React.SetStateAction<number>) =>
    setPortions((prev) => {
      const next: [number, number] = [prev[0], prev[1]];
      next[i] = typeof update === "function" ? update(prev[i]) : update;
      return next;
    });

  const loadPreset = (p: ComparePreset) => {
    setPresetId(p.id);
    setSelections([{ ...p.sides[0] }, { ...p.sides[1] }]);
    setPortions([p.portions[0] ?? 1, p.portions[1] ?? 1]);
  };

  return (
    <div>
      {/*
        The starting point, as one object.

        This used to be three stacked strata -- a 12px inline label, a row of
        40px pills, then five lines of rule prose -- sandwiched between the page
        intro and the builder. On a phone that put about nine lines of text
        between you and the thing you came to use, and the label read as an
        orphan hanging off the pills rather than as their heading (it was
        centred to the pixel; the problem was hierarchy, not alignment).

        Now: label above its control, both in one bordered block, with the rule
        collapsed behind a summary that names the build. Every word stays in the
        DOM -- it is the honest account of what the preset contains, and it is
        the only per-pair prose on the page.
      */}
      {presets.length > 0 && (
        <div className="mb-5 max-w-2xl rounded-2xl border border-line bg-surface-2 p-3">
          <p
            id="start-from"
            className="px-1 text-xs font-semibold uppercase tracking-wider text-muted"
          >
            Start from
          </p>
          <div
            role="group"
            aria-labelledby="start-from"
            className="mt-2 flex flex-wrap gap-2"
          >
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => loadPreset(p)}
                aria-pressed={p.id === presetId}
                className={`flex min-h-10 items-center rounded-full border px-3.5 text-xs transition-colors ${
                  p.id === presetId
                    ? "border-brand bg-surface font-semibold text-fg"
                    : "border-line bg-surface text-muted hover:border-fg/30 hover:text-fg"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          {preset && (
            <details className="group mt-2.5">
              <summary className="inline-flex min-h-8 cursor-pointer list-none items-center px-1 text-xs text-muted underline decoration-line underline-offset-2 hover:text-fg">
                What&rsquo;s in this order?
                <span className="ml-1 group-open:hidden" aria-hidden>
                  &#9656;
                </span>
                <span className="ml-1 hidden group-open:inline" aria-hidden>
                  &#9662;
                </span>
              </summary>
              <p className="mt-1 max-w-2xl border-l border-line px-1 pl-3 text-xs leading-relaxed text-muted">
                {preset.rule}
              </p>
            </details>
          )}
        </div>
      )}

      {/* Mobile: one side at a time. Two full build flows will not fit at
          390px, and the thing being compared is the difference anyway, which
          the bar at the bottom keeps on screen whichever side you are on. */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:hidden">
        {chains.map((c, i) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setTab(i)}
            aria-pressed={tab === i}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
              tab === i
                ? "border-brand bg-surface font-semibold"
                : "border-line text-muted"
            }`}
          >
            <ChainMark
              glyph={c.glyph}
              name={c.name}
              tint={tints[i]}
              emphasis="solid"
              className="h-7 w-7 rounded-lg"
              iconClassName="h-5 w-5"
            />
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {chains.map((chain, i) => (
          // Both sides stay in the DOM on mobile — only one is shown. The
          // hidden half is still the indexable half of the comparison.
          //
          // data-chain is doing real work here rather than decorating: this is
          // the one screen showing two chains at once, so each column's
          // selections carry that chain's colour and it stays obvious which
          // half you are editing. The totals bar below stays brand teal.
          //
          // Known weak spot, measured rather than guessed: 5 of the 12
          // recommended pairs are same-cuisine, and those two chains share a
          // hue and differ only in shade. At full strength -- the step badges,
          // the selected chips, the row highlights -- that is a ~0.10 OKLab
          // step, which is visible. Where it fails is the 36px chain mark,
          // whose ground is color-mix(... 11%, surface): the same step arrives
          // there as ~0.011, well under the threshold anyone can see.
          //
          // This was briefly "fixed" by dropping the tint and painting both
          // columns brand teal. That was the wrong trade -- it removed a
          // working signal from the chrome to fix the marks, and made a chain
          // one colour on its own page and another here. If the marks need
          // solving, solve the dilution, not the hue.
          <div
            key={chain.slug}
            data-chain
            style={
              {
                "--chain-l": tints[i].light,
                "--chain-d": tints[i].dark,
              } as CSSProperties
            }
            className={`min-w-0 ${tab === i ? "" : "hidden lg:block"}`}
          >
            <div className="mb-3 hidden items-center gap-2.5 lg:flex">
              <ChainMark
                glyph={chain.glyph}
                name={chain.name}
                tint={tints[i]}
                emphasis="solid"
              />
              <p className="text-sm font-semibold">{chain.name}</p>
            </div>
            <MealBuilder
              chain={chain}
              selections={selections[i]}
              onSelectionsChange={setSide(i as 0 | 1)}
              portion={portions[i]}
              onPortionChange={setSidePortion(i as 0 | 1)}
              syncUrl={false}
              chrome="bare"
            />
          </div>
        ))}
      </div>

      {/* Always rendered, never behind a toggle: this is the answer the page
          exists to give, and the half a crawler reads. */}
      <section className="mt-8 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight">The difference</h2>
            <p className="mt-1 text-xs text-muted">
              Both meals as served. Change either side above and these update.
            </p>
          </div>
          <button
            type="button"
            disabled={empty}
            onClick={async () => {
              if (await copyText(diffText(names, rows, chains, selections))) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
          >
            {copied ? (
              <>
                <IconCheck className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <IconCopy className="h-3.5 w-3.5" /> Copy comparison
              </>
            )}
          </button>
        </div>
        {/* What is actually in each meal, in words. Rendered from live
            selections so it is right after an edit, and present in the server
            HTML so the comparison reads as prose without running any of it. */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {chains.map((chain, i) => {
            const picked = chain.components.filter((c) => selections[i][c.id]);
            return (
              <div key={chain.slug}>
                <p className="text-xs font-semibold">{chain.name}</p>
                {picked.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">Nothing picked yet.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {picked.map((c) => (
                      <li key={c.id} className="truncate">
                        {c.name}
                        {selections[i][c.id] !== 1 && ` ×${selections[i][c.id]}`}
                        {c.estimated?.length ? (
                          <span
                            title="one or more figures on this row are our estimate"
                            className="ml-1 text-[10px] uppercase tracking-wide"
                          >
                            est
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {picked.length > 0 && (
                  <Link
                    href={mealHref(chain.slug, selections[i], portions[i])}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted underline decoration-line underline-offset-4 transition-colors hover:text-fg"
                  >
                    <IconExternal className="h-3.5 w-3.5" />
                    Open in the {chain.name} calculator
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {/* Said once rather than twice on the links themselves: the label and
            its image/share tooling belong to the single-meal calculator, and
            this hands the meal over intact rather than making you rebuild it. */}
        <p className="mt-3 text-xs text-muted">
          Nutrition labels, saved images and share links live in each
          chain&rsquo;s own calculator — your meal travels with the link.
        </p>

        <div className="mt-4">
          <CompareTable rows={rows} names={names} />
        </div>
      </section>

      {/* Sticky summary: the two numbers people came for, on screen while
          they build, on both breakpoints. */}
      {!empty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
          <div className="pointer-events-auto mx-auto max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-on-accent shadow-lg shadow-accent/30">
              {chains.map((c, i) => (
                <span key={c.slug} className="min-w-0">
                  <span className="block truncate text-[11px] opacity-80">
                    {c.name}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {show(facts[i].totals.calories)}
                    <span className="text-xs font-normal opacity-90"> cal</span>
                  </span>
                </span>
              ))}
              <span className="shrink-0 text-right text-xs tabular-nums">
                {(["calories", "protein_g"] as const).map((field) => {
                  const r = rows.find((x) => x.field === field)!;
                  if (r.spread === null || r.highest === null) return null;
                  return (
                    <span key={field} className="block">
                      {names[r.highest]} +{fmtNutrient(r.spread, field)}
                      {field === "calories" ? " cal" : "g protein"}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A meal's home in its own chain's calculator.
 *
 * Carries the portion as well as the selections: without &p= a Papa John's or
 * Domino's meal would arrive with its slice count reset to 1 and quietly show
 * different totals than the comparison it came from.
 */
function mealHref(slug: string, sel: Selections, portion: number): string {
  const m = encodeMeal(sel);
  return `/${slug}?m=${encodeURIComponent(m)}${portion > 1 ? `&p=${portion}` : ""}`;
}

/** The comparison as plain text, for pasting into a thread or a chat. */
function diffText(
  names: string[],
  rows: ReturnType<typeof compareRows>,
  chains: [Chain, Chain],
  selections: [Selections, Selections],
): string {
  const out = [`${names[0]} vs ${names[1]}`, ""];
  chains.forEach((chain, i) => {
    const picked = chain.components.filter((c) => selections[i][c.id]);
    out.push(`${chain.name}: ${picked.map((c) => c.name).join(", ") || "nothing"}`);
  });
  out.push("");
  for (const r of rows) {
    const label = NUTRIENT_LABELS[r.field];
    const cells = r.values.map((v, i) =>
      v === null
        ? "not published"
        : `${r.approx[i] ? "~" : ""}${fmtNutrient(v, r.field)}${r.unit}`,
    );
    const gap =
      r.spread === null ? "" : r.spread === 0 ? "  (same)" : `  (${names[r.highest!]} +${fmtNutrient(r.spread, r.field)}${r.unit})`;
    out.push(`${label}: ${names[0]} ${cells[0]} / ${names[1]} ${cells[1]}${gap}`);
  }
  out.push("", typeof window === "undefined" ? "" : window.location.href);
  return out.join("\n");
}

function decode(raw: string, chain: Chain): Selections {
  // Local copy of the builder's tolerant decode: an id the chain no longer has
  // drops out rather than taking the whole shared link down.
  const valid = new Set(chain.components.map((c) => c.id));
  const sel: Selections = {};
  for (const part of raw.split(",")) {
    const [id, qRaw] = part.split(":");
    const q = qRaw === undefined ? 1 : Number(qRaw);
    if (valid.has(id) && Number.isFinite(q) && q > 0) sel[id] = q;
  }
  return sel;
}
