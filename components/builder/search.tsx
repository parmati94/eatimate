"use client";

/** One field over the whole chart, and what it turns the page into.
 *
 *  Deliberately not filed under "Add to it": it reaches the numbered steps too,
 *  and a box under that heading would be claiming a scope it does not have.
 *  Somebody looking for Tots does not know, and should not have to know, that
 *  Sonic lists them both on the meal shelf and under Snacks & Sides. */
import { useState } from "react";
import type { Chain, Component } from "@/lib/schema";
import type { MenuFamily, MenuSearchResult } from "@/lib/search";
import { Selections } from "@/lib/meal";
import { IconSearch } from "../icons";
import { FamilyRow, SEARCH_THRESHOLD } from "./rows";

/**
 * The field, what it says it covers, and the words worth tapping.
 *
 * Three things the six skins we drew never touched, all of them from what the
 * control DOES rather than how it sits next to the cards:
 *
 *   - it covers between 32 rows and 699 depending on the chain, and said
 *     nothing about which;
 *   - typing one character replaces the whole page body, so it is a mode
 *     switch, and the loud moment belongs to the active state, not the idle
 *     one -- hence the pin, the running count and Cancel;
 *   - the chart is written in the chain's words. Nobody types "Limeades &
 *     Slushes", so the chips offer the customer's word instead.
 */
export function MenuSearch({
  chainName,
  rosterCount,
  chips,
  value,
  onChange,
  searching,
  matches,
}: {
  chainName: string;
  /** Rows this field is offering to search, on the path in effect. */
  rosterCount: number;
  chips: { word: string; count: number }[];
  value: string;
  onChange: (v: string) => void;
  searching: boolean;
  matches: number;
}) {
  const typed = value.trim().toLowerCase();
  return (
    <div
      // Searching is a mode, so the control that governs it stays on screen
      // for the whole of it: top-14 is the site header, which is sticky too,
      // and the bleed and blur let results scroll under it cleanly.
      //
      // Nothing scrolls the page to meet it. Three attempts at repositioning
      // on focus all left the field half behind the header on an iPhone --
      // Safari opens the keyboard after the focus event, runs its own reveal,
      // and resizes the visual viewport, so any scroll we compute is against
      // a layout that is about to change. The room this was buying back is
      // already there from the chooser and portion control standing down.
      className={
        searching
          ? "sticky top-14 z-10 -mx-2 space-y-1.5 bg-bg/90 px-2 py-2 backdrop-blur"
          : "space-y-1.5"
      }
    >
      <label className="relative block">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-strong" />
        <input
          type="search"
          suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Names the chain, because the homepage has a box that looks like
          // this one and searches restaurants; names the count, because a
          // field over Chipotle's 32 rows and one over Buffalo Wild Wings'
          // 699 are not the same promise.
          placeholder={`Search ${rosterCount} items at ${chainName}`}
          aria-label={`Search ${rosterCount} items at ${chainName}`}
          className={`w-full rounded-2xl border bg-surface py-3 pl-10 text-[15px] shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 ${
            searching ? "border-accent pr-20" : "border-line pr-4"
          }`}
        />
        {searching && (
          // Cancel, not a cross: leaving search means leaving a mode that
          // replaced the page, and a bare ✕ reads as "empty this box".
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-sm font-medium text-accent-strong transition-colors hover:bg-accent-soft"
          >
            Cancel
          </button>
        )}
      </label>
      {searching ? (
        <p className="px-1 text-xs text-muted" aria-live="polite">
          <span className="num font-semibold text-fg">{matches}</span> match
          {matches === 1 ? "" : "es"} across {chainName}
        </p>
      ) : (
        chips.length > 0 && (
          // The chips replace a blank prompt with a demonstration. They are
          // shortcuts, not a second filter: each one types its own word.
          <ul className="flex flex-wrap gap-1.5 px-0.5">
            {chips.map(({ word, count }) => (
              <li key={word}>
                <button
                  type="button"
                  onClick={() => onChange(word)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    typed === word.toLowerCase()
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface hover:border-accent hover:bg-surface-2"
                  }`}
                >
                  {word}
                  <span className="num text-[11px] text-muted">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
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
}: {
  chain: Chain;
  query: string;
  result: MenuSearchResult;
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
      <div className="rounded-2xl border border-line bg-surface p-2 shadow-sm">
        <ul className="space-y-0.5">
          {shown.map(({ cat, head, members }) => (
            <SearchHit
              key={`${cat.id}/${head.id}`}
              cat={cat}
              head={head}
              members={members}
              isStep={stepCats.has(cat.id)}
              selections={selections}
              addonsOf={addonsOf}
              qtySteps={portionCats.has(cat.id) ? qtySteps : undefined}
              qmultFor={qmultFor}
              toggle={toggle}
              setQty={setQty}
            />
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

/** One result: the row it would be in its own category, plus where that is. */
function SearchHit({
  cat,
  head,
  members,
  isStep,
  selections,
  addonsOf,
  qtySteps,
  qmultFor,
  toggle,
  setQty,
}: MenuFamily & {
  isStep: boolean;
  selections: Selections;
  addonsOf: Map<string, Component[]>;
  qtySteps?: number[];
  qmultFor: (comp: Component) => number;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  return (
    <li>
      <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {cat.name}
        {isStep && <span className="font-medium normal-case tracking-normal"> &middot; a step in the flow</span>}
      </p>
      <ul>
        <FamilyRow
          head={head}
          members={members}
          selections={selections}
          single={cat.select === "single"}
          qtySteps={qtySteps}
          qmultFor={qmultFor}
          toggle={toggle}
          setQty={setQty}
          addonsOf={addonsOf}
          // Always, whatever the category says.
          //
          // The rule elsewhere keys off the category, on the grounds that the
          // size IS the question for a drink. In a result list it is not: the
          // question is which of these six rows you meant, and the size can
          // wait for the answer. This is the case chipsOnPick was measured for
          // -- Chick-fil-A's fourteen rows ran 3,219px with chips against
          // Burger King's 851px without -- and search results are the most
          // scannable list on the site.
          chipsOnPick
        />
      </ul>
    </li>
  );
}
