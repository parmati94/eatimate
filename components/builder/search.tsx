"use client";

/** One field over the whole chart, and what it turns the page into.
 *
 *  Deliberately not filed under "Add to it": it reaches the numbered steps too,
 *  and a box under that heading would be claiming a scope it does not have.
 *  Somebody looking for Tots does not know, and should not have to know, that
 *  Sonic lists them both on the meal shelf and under Snacks & Sides. */
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";

/** The desktop layout, where search is a dropdown rather than a screen. */
export const wide = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
import type { Chain, Component } from "@/lib/schema";
import type { MenuFamily, MenuSearchResult } from "@/lib/search";
import { Selections } from "@/lib/meal";
import { IconSearch } from "../icons";
import { FamilyRow, SEARCH_THRESHOLD } from "./rows";

/**
 * The field at the top of the page, which is two things by breakpoint.
 *
 * On a phone it is a button that looks like a field: tapping it opens the
 * search screen (SearchLayer), whose input is the real one. That is the native
 * pattern, and it means the input is only ever focused inside the tap that
 * opens the screen -- the one moment iOS reliably raises the keyboard.
 *
 * On a wide screen it IS the field. Results drop down from its bottom edge as
 * a panel the width of the field, in the same card language as an open step,
 * with the page title, the field and the label sidebar all still where they
 * were. A column-sized layer was tried first and read as a blob arriving over
 * the builder: neither a screen nor a component. A dropdown is anchored to the
 * thing you typed in, so it needs no explaining.
 */
export function SearchField({
  chainName,
  rosterCount,
  value,
  onChange,
  open,
  onOpen,
  onClose,
  matches,
  wrapRef,
  children,
}: {
  chainName: string;
  rosterCount: number;
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  matches: number;
  /** The whole thing, field and panel, so the builder can tell an outside
   *  click from one inside. */
  wrapRef: Ref<HTMLDivElement>;
  /** The panel's body on a wide screen: results, once something is typed. */
  children: ReactNode;
}) {
  const searching = value.trim().length > 0;
  const anchor = useRef<HTMLDivElement>(null);
  // The panel may not run past the bottom of the window: it starts wherever
  // the field is, which moves with the page, so its ceiling is measured on
  // open and again on scroll and resize while it is up.
  const [maxH, setMaxH] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !searching) return;
    const measure = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setMaxH(Math.max(200, window.innerHeight - r.bottom - 24));
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [open, searching]);
  const label = `Search ${rosterCount} items at ${chainName}`;
  return (
    <div ref={wrapRef} className="relative lg:z-20">
      {/* At rest this is a tinted well, not a bordered card: the path chooser
          above it and the first numbered step below it are both
          `border-line bg-surface shadow-sm`, and wearing the same clothes was
          what made a control read as a third panel in a stack of three. Filling
          with the chain's own accent-soft and dropping the border and shadow
          says "operate me" instead. Typing turns it back into an ordinary
          field -- once there are results to read, quiet is what a field owes.

          Phone: the door to the search screen. */}
      <button
        type="button"
        onClick={onOpen}
        className="relative flex min-h-12 w-full items-center rounded-2xl border border-transparent bg-accent-soft py-3 pl-10 pr-4 text-left text-[15px] font-medium text-accent-strong transition-colors hover:border-accent/40 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 lg:hidden"
      >
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-strong" />
        {label}
      </button>
      {/* Wide: the field itself. */}
      <div ref={anchor} className="relative hidden lg:block">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-strong" />
        <input
          type="search"
          suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
          value={value}
          onFocus={onOpen}
          onChange={(e) => {
            onChange(e.target.value);
            onOpen();
          }}
          placeholder={label}
          aria-label={label}
          className={`w-full rounded-2xl border py-3 pl-10 text-[15px] outline-none transition-[border-color,box-shadow,background-color] focus:border-accent focus:ring-4 focus:ring-accent/15 ${
            open && searching
              ? "border-accent bg-surface pr-20 shadow-sm placeholder:text-muted"
              : "border-transparent bg-accent-soft pr-4 font-medium placeholder:text-accent-strong"
          }`}
        />
        {open && searching && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-sm font-medium text-accent-strong transition-colors hover:bg-accent-soft"
          >
            Cancel
          </button>
        )}
      </div>
      {open && searching && (
        <div
          role="region"
          aria-label={`Results for ${value.trim()}`}
          style={maxH ? { maxHeight: maxH } : undefined}
          className="absolute inset-x-0 top-full z-20 mt-2 hidden overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-2xl motion-safe:animate-[drop-in_.16s_ease-out] lg:block"
        >
          <p className="px-3 pb-1 pt-1.5 text-xs text-muted" aria-live="polite">
            <span className="num font-semibold text-fg">{matches}</span> match
            {matches === 1 ? "" : "es"} across {chainName}
          </p>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The search screen on a phone: field at the top, results under it, from
 * anywhere on the page.
 *
 * Results used to replace the page body in place, which meant that a search
 * started 700px down was read from 700px down -- unless it returned few
 * rows, in which case the page shrank under the scroll position and the
 * browser snapped to the top. Two behaviours for one action. A fixed layer
 * under the site header makes the page's scroll position irrelevant: the
 * field is always at the top, Cancel drops you back exactly where you were,
 * and nothing scrolls the page. Three attempts at scrolling the page to meet
 * a focused field all lost to Safari's keyboard reveal; this never tries.
 *
 * Sized from the top edge, not the bottom: iOS shrinks the visual viewport
 * for the keyboard and leaves the layout viewport alone, so anything pinned
 * to the bottom would sit under the keys. The results scroll inside.
 * Translucent and blurred, so it reads as a layer over the builder rather
 * than the builder blanking out; results themselves sit on an opaque card.
 */
export function SearchLayer({
  chainName,
  rosterCount,
  value,
  onChange,
  onClose,
  matches,
  inputRef,
  children,
}: {
  chainName: string;
  rosterCount: number;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  matches: number;
  inputRef: Ref<HTMLInputElement>;
  children: ReactNode;
}) {
  const searching = value.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-label={`Search ${chainName}`}
      className="fixed inset-x-0 bottom-0 top-14 z-20 overflow-y-auto bg-bg/80 backdrop-blur-xl"
    >
      <div className="mx-auto w-full max-w-5xl px-4 pb-32 pt-3">
        <div className="sticky top-0 z-10 -mx-2 space-y-1.5 px-2 pb-2">
          <label className="relative block">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-strong" />
            <input
              ref={inputRef}
              type="search"
              suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Search ${rosterCount} items at ${chainName}`}
              aria-label={`Search ${rosterCount} items at ${chainName}`}
              className="w-full rounded-2xl border border-accent bg-surface py-3 pl-10 pr-20 text-[15px] shadow-sm outline-none focus:ring-4 focus:ring-accent/15 placeholder:text-muted"
            />
            {/* Cancel, not a cross: leaving search means leaving a screen,
                and a bare ✕ reads as "empty this box". */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-sm font-medium text-accent-strong transition-colors hover:bg-accent-soft"
            >
              Cancel
            </button>
          </label>
          {searching && (
            <p className="px-1 text-xs text-muted" aria-live="polite">
              <span className="num font-semibold text-fg">{matches}</span> match
              {matches === 1 ? "" : "es"} across {chainName}
            </p>
          )}
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * The results, standing where the rest of the builder was.
 *
 * Replacing rather than stacking: results above the accordions would make the
 * page longer, and length is the thing search is here to fix.
 */
export function SearchResults({
  chain,
  query,
  result,
  otherPathName,
  stepCats,
  selections,
  addonsOf,
  portionCats,
  qtySteps,
  qmultFor,
  toggle,
  setQty,
  framed = true,
}: {
  chain: Chain;
  query: string;
  result: MenuSearchResult;
  /** Draw the results as a card. Off inside the desktop dropdown, which is
   *  already the card -- a card inside a card was the double frame that made
   *  the panel read as one more accordion. */
  framed?: boolean;
  /** What to call the path the unreachable matches are on. */
  otherPathName: string;
  /** Category ids that are numbered steps right now, so a result can say that
   *  picking it will move the flow rather than just add a thing. */
  stepCats: Set<string>;
  selections: Selections;
  addonsOf: Map<string, Component[]>;
  portionCats: Set<string>;
  qtySteps: number[];
  qmultFor: (comp: Component) => number;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { hits, elsewhere } = result;
  const capped = hits.length > SEARCH_THRESHOLD && !expanded;
  const shown = capped ? hits.slice(0, SEARCH_THRESHOLD) : hits;

  if (hits.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-surface px-4 py-6 text-center shadow-sm">
        <p className="text-sm">
          Nothing on {chain.name}&rsquo;s chart matches{" "}
          <span className="font-semibold">&ldquo;{query.trim()}&rdquo;</span>.
        </p>
        {elsewhere > 0 && (
          // Not "no results": the chain does sell it, this path just does not
          // offer it. Saying nothing here would make the site look wrong about
          // a menu it has right.
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
            {elsewhere} match{elsewhere === 1 ? " is" : "es are"} on the{" "}
            {otherPathName} path. Cancel the search, then use Change to start
            that way instead.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-1">
      {elsewhere > 0 && (
        // The running count is in the sticky field above; this line only has to
        // carry what that one cannot -- that the chain sells more of these on
        // the path you are not on.
        <p className="px-1 text-xs text-muted">
          {elsewhere} more on the {otherPathName} path
        </p>
      )}
      <div className={framed ? "rounded-2xl border border-line bg-surface p-2 shadow-sm" : ""}>
        <ul className="space-y-1">
          {/* One heading per category, not one per row. "chick" on Chipotle
              returned four proteins, each under its own "PROTEIN · a step in
              the flow" line -- the same words four times in 300px. Grouped in
              order of first appearance, so the best match's category still
              leads. */}
          {groupByCategory(shown).map(({ cat, families }) => (
            <li key={cat.id}>
              <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {cat.name}
                {stepCats.has(cat.id) && (
                  <span className="font-medium normal-case tracking-normal">
                    {" "}&middot; a step in the flow
                  </span>
                )}
              </p>
              <ul className="space-y-0.5">
                {families.map(({ head, members }) => (
                  <FamilyRow
                    key={head.id}
                    head={head}
                    members={members}
                    selections={selections}
                    single={cat.select === "single"}
                    qtySteps={portionCats.has(cat.id) ? qtySteps : undefined}
                    qmultFor={qmultFor}
                    toggle={toggle}
                    setQty={setQty}
                    addonsOf={addonsOf}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {capped && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 w-full rounded-lg py-2 text-sm font-medium text-accent-strong transition-colors hover:bg-surface-2"
          >
            Show all {hits.length}
          </button>
        )}
      </div>
    </section>
  );
}

/** Hits bucketed by category, categories in order of their first hit. */
function groupByCategory(hits: MenuFamily[]) {
  const out: { cat: MenuFamily["cat"]; families: MenuFamily[] }[] = [];
  for (const hit of hits) {
    const last = out.find((g) => g.cat.id === hit.cat.id);
    if (last) last.families.push(hit);
    else out.push({ cat: hit.cat, families: [hit] });
  }
  return out;
}
