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
import { IconSearch, IconX } from "../icons";
import { FamilyRow, SEARCH_THRESHOLD } from "./rows";

export function MenuSearchField({
  value,
  onChange,
  chainName,
}: {
  value: string;
  onChange: (v: string) => void;
  chainName: string;
}) {
  return (
    <label className="relative block">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Names the chain, because the homepage has a search box that looks
        // like this one and searches restaurants.
        placeholder={`Search the ${chainName} menu…`}
        aria-label={`Search the ${chainName} menu`}
        className="w-full rounded-2xl border border-line bg-surface py-3 pl-10 pr-10 text-[15px] shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear the search"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
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
            {otherPathName} path. Use Change above to start that way instead.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-1">
      <p className="px-1 text-xs text-muted">
        <span className="num font-semibold text-fg">{hits.length}</span> match
        {hits.length === 1 ? "" : "es"} across {chain.name}
        {elsewhere > 0 && (
          <>
            {" "}
            &middot; {elsewhere} more on the {otherPathName} path
          </>
        )}
      </p>
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
          // The same rule the row obeys where it lives. A result that behaved
          // differently from its own category would be a third place this
          // decision is made, and the last two bugs in the builder were one
          // concept with two call sites drifting apart.
          chipsOnPick={!(cat.size_leads ?? (cat.flow ?? "build") === "extras")}
        />
      </ul>
    </li>
  );
}
