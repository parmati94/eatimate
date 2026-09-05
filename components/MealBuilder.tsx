"use client";

import {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { flushSync } from "react-dom";
import {
  BAR_MACROS,
  clearLastOrder,
  readBarMacro,
  readLastOrder,
  writeBarMacro,
  writeLastOrder,
  type BarMacro,
  DEFAULT_BAR_MACRO,
} from "@/lib/prefs";
import {
  buildPath,
  defaultMode as defaultPath,
  mealStarted,
  modeOf,
  owedNote,
  splitCats,
} from "@/lib/flow";
import { menuFamilies, reachableCount, searchMenu } from "@/lib/search";
import { useSearchMiss } from "@/lib/search-miss";
import type { Category, Chain, Component } from "@/lib/schema";
import {
  show
} from "@/lib/rounding";
import {
  COVERAGE_STEPS,
  Selections,
  activeSizeMode,
  decodeMeal,
  defaultSizeMode,
  encodeMeal,
  estimatedNutrients,
  mealLines,
  mealSubtitle,
  mealTotals,
  unknownNutrients
} from "@/lib/meal";
import NutritionLabel from "./NutritionLabel";
import YourPicks from "./builder/picks";
import { SearchField, SearchLayer, SearchResults, wide } from "./builder/search";
import { mealUrl } from "./builder/format";
import {
  ExtrasSection,
  FamilyRow,
  QtyStepper,
  StepSection
} from "./builder/rows";
import {
  CopyLabelButton,
  SaveImageButton,
  ShareMealButton
} from "./builder/actions";
import {
  IconChevron,
  IconSearch,
  IconX
} from "./icons";
import { possessive } from "@/lib/text";
import { track } from "@/lib/analytics";

/** Quiet period before mirroring selections into the URL (see the sync effect). */
const URL_SYNC_DELAY_MS = 600;

/**
 * The build flow for one chain.
 *
 * Uncontrolled by default, which is what the chain page wants: it owns its own
 * selections and mirrors them into ?m=. The comparison view passes `selections`
 * and `onSelectionsChange` to hold two of these at once, turns `syncUrl` off so
 * one builder cannot fight the other over the address bar, and asks for `bare`
 * chrome because the comparison owns the totals panel for both sides.
 */
/** Components before a meal counts as built rather than poked at. */
const MEAL_BUILT_AT = 3;

export default function MealBuilder({
  chain,
  selections: controlledSelections,
  onSelectionsChange,
  portion: controlledPortion,
  onPortionChange,
  syncUrl = true,
  chrome = "full"
}: {
  chain: Chain;
  selections?: Selections;
  onSelectionsChange?: Dispatch<SetStateAction<Selections>>;
  portion?: number;
  onPortionChange?: Dispatch<SetStateAction<number>>;
  syncUrl?: boolean;
  chrome?: "full" | "bare";
}) {
  const [ownSelections, setOwnSelections] = useState<Selections>({});
  const selections = controlledSelections ?? ownSelections;
  const setSelections = onSelectionsChange ?? setOwnSelections;
  const [labelOpen, setLabelOpen] = useState(false);
  const hydrated = useRef(false);

  // What this device remembers (lib/prefs.ts). Read after mount, like ?m=,
  // because localStorage does not exist during SSR.
  const [last, setLast] = useState<{ sel: Selections; p: number } | null>(null);
  const [barMacro, setBarMacro] = useState<BarMacro>(DEFAULT_BAR_MACRO);
  const bar = BAR_MACROS.find((b) => b.field === barMacro)!;

  // Search is a screen (see SearchLayer), reached from the field at the top
  // of the page and from the totals bar. Opened inside the tap handler and
  // focused there too, which is the one moment iOS will open a keyboard for
  // a programmatic focus. Nothing here scrolls the page.
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The field and its dropdown on a wide screen, for telling an outside
  // click from one inside.
  const wrapRef = useRef<HTMLDivElement>(null);
  const openSearch = () => {
    // Opening an open search is not an event, and on the wide layout it is not
    // even rare: the field calls this from onChange as well as onFocus, so it
    // ran once per KEYSTROKE -- a flushSync re-render and a focus() per
    // character, which was invisible until each one also sent an event.
    if (searchOpen) return;
    track("search-opened", { chain: chain.slug });
    flushSync(() => setSearchOpen(true));
    inputRef.current?.focus({ preventScroll: true });
  };

  const byCategory = useMemo(() => {
    const m = new Map<string, Component[]>();
    for (const c of chain.components) {
      const list = m.get(c.category) ?? [];
      list.push(c);
      m.set(c.category, list);
    }
    return m;
  }, [chain]);

  // Chain-wide size scaling (e.g. Subway 6" vs Footlong). Activated by the
  // selected component carrying a size_mode (the Size step's rows) — the
  // format pick IS the size choice; there is no separate control.
  const modes = chain.size_modes ?? null;
  const defaultMode = defaultSizeMode(chain);
  const activeMode = useMemo(
    () => activeSizeMode(chain, selections),
    [chain, selections],
  );
  const mult = (cat: string) => activeMode?.multipliers[cat] ?? 1;
  // A row that would activate a mode previews its own scaling.
  const rowMult = (comp: Component) => {
    if (comp.size_mode && modes) {
      const m = modes.find((x) => x.id === comp.size_mode);
      return m?.multipliers[comp.category] ?? 1;
    }
    return mult(comp.category);
  };
  // Mode-gated visibility: e.g. loaves only for 6"/footlong, mini loaves only
  // for kids mini. A category with nothing visible disappears entirely.
  const isVisible = (c: Component) =>
    !c.only_modes || (activeMode != null && c.only_modes.includes(activeMode.id));
  const visibleByCategory = useMemo(() => {
    const m = new Map<string, Component[]>();
    for (const c of chain.components) {
      if (!isVisible(c)) continue;
      const list = m.get(c.category) ?? [];
      list.push(c);
      m.set(c.category, list);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, activeMode]);

  // The two paths, the numbered steps and the additive rest all come from
  // lib/flow.ts, which is pure and tested over the real chain files.
  const { presetCats, scratchCats, hasPresets } = splitCats(chain, visibleByCategory);

  const [mode, setMode] = useState<"menu" | "scratch" | null>(defaultPath(chain));
  // A preloaded comparison never mounts empty, so this settles it before paint
  // rather than in an effect that would flash the chooser first.
  //
  // A meal in hand BEATS default_flow, which is only a guess at what someone
  // arriving cold would want. Little Caesars defaults to building, so the pizza
  // comparison mounted it on the build path where its preset pepperoni does not
  // render -- the calories counted while nothing on screen looked chosen.
  const [modeSettled, setModeSettled] = useState(false);
  if (!modeSettled && hasPresets) {
    const m = modeOf(chain, selections);
    if (m && m !== mode) setMode(m);
    setModeSettled(true);
  }

  const path = buildPath(chain, mode, selections, visibleByCategory);
  const { buildCats, extraCats } = path;
  /** The steps you owe, the owed one carrying the chain's own words as its note. */
  const owedSteps = path.owed
    ? [...path.stepCats.slice(0, -1), { ...path.owed.cat, note: owedNote(chain, path.owed) }]
    : path.stepCats;
  const owedAdds = path.addCats;

  // "Make it a meal": the handful of items most orders actually include, lifted
  // out of the extras accordions. Same component ids, so selecting here and
  // selecting below are the same act.
  const featured = useMemo(() => {
    const out: { cat: Category; comps: Component[] }[] = [];
    for (const cat of chain.categories) {
      const comps = (visibleByCategory.get(cat.id) ?? []).filter(
        (c) => c.feature && !c.variant_of,
      );
      if (comps.length) out.push({ cat, comps });
    }
    return out;
  }, [chain, visibleByCategory]);


  // The numbered steps are exclusive: they are a sequence, one question at a
  // time, and answering one advances to the next.
  const [openCat, setOpenCat] = useState<string | null>(
    buildCats[0]?.id ?? null,
  );
  // The additive ones are not. They sit under "Add to it" beside the extras
  // accordions, which have always been independent, and which of the two a
  // category got was decided by `flow` -- a fact about the build path with no
  // opinion about accordions. Sonic ended up with three exclusive and seven
  // independent under one heading, identical to look at, and closing your open
  // step to glance at the drinks is pure loss when nothing is being sequenced.
  const [openAdds, setOpenAdds] = useState<string[]>([]);
  const toggleAdd = (id: string) =>
    setOpenAdds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // One field over the whole chart. It only appears once a path is in effect:
  // before that the page is a two-button question, and a result picked with no
  // path could land in a category this page is not rendering -- checked,
  // counted and invisible.
  const [query, setQuery] = useState("");
  // Not in the comparison view: its two builders are preloaded meals in narrow
  // columns, and a search field in each would be two boxes competing over one
  // question nobody asked there.
  const pathChosen = chrome === "full" && (!hasPresets || mode !== null);
  const searching = pathChosen && query.trim().length > 0;
  const families = useMemo(
    () => menuFamilies(chain, visibleByCategory),
    [chain, visibleByCategory],
  );
  // Only what this path offers. Searching across both would let a menu item be
  // selected while the build path is on screen, which is the same invisible
  // selection by another route -- so the ones on the other path are counted
  // and mentioned rather than listed.
  //
  // Not memoised: buildPath rebuilds these arrays every render, so a dependency
  // list on them memoises nothing and only stops the compiler optimising the
  // rest of the component. The work is a set of a dozen ids and a pass over the
  // families, and it only runs while something is typed.
  const reachable = new Set([...buildCats, ...extraCats].map((c) => c.id));
  const found = searching
    ? searchMenu(families, query, reachable)
    : { hits: [], elsewhere: 0 };
  // What this chain's chart was asked for and did not have. "elsewhere" rides
  // along because the two misses are different problems: nothing at all is a
  // gap in the data, while matches on the other path is a gap in the UI.
  useSearchMiss(query, searching && found.hits.length === 0, {
    scope: "menu",
    chain: chain.slug,
    elsewhere: found.elsewhere,
  });
  // Keyed by the exact component an add-on attaches to, matching CategoryBody:
  // the parent is already size-resolved, so garlic oil on a medium is a
  // different row from garlic oil on a large.
  const addonsOf = useMemo(() => {
    const m = new Map<string, Component[]>();
    for (const c of chain.components) {
      if (!c.addon_of || !isVisible(c)) continue;
      m.set(c.addon_of, [...(m.get(c.addon_of) ?? []), c]);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, activeMode]);

  /** Choosing a path drops anything picked on the other one, so a hidden
   *  selection can never keep counting toward the totals. */
  const chooseMode = (next: "menu" | "scratch") => {
    const drop = new Set(
      (next === "menu" ? scratchCats : presetCats).flatMap((c) =>
        (visibleByCategory.get(c.id) ?? []).map((x) => x.id),
      ),
    );
    setSelections((prev) => {
      const kept: Selections = {};
      for (const [id, q] of Object.entries(prev)) if (!drop.has(id)) kept[id] = q;
      return kept;
    });
    setMode(next);
    setQuery("");
    setOpenCat(
      (next === "menu" ? presetCats : scratchCats)[0]?.id ?? null,
    );
  };

  // Changing the format prunes picks that are no longer offered (switching
  // to Wrap drops a selected loaf, etc.).
  useEffect(() => {
    setSelections((prev) => {
      let changed = false;
      const next: Selections = {};
      for (const c of chain.components) {
        if (!prev[c.id]) continue;
        if (isVisible(c)) next[c.id] = prev[c.id];
        else changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  // Portion: how much of the built item was eaten. Distinct from a component's
  // own quantity, which is coverage (half the pizza gets pepperoni). Only the
  // categories the chain names are scaled, so a side never rides along.
  const portionMax = activeMode?.portion_count ?? 0;
  const portionCats = useMemo(
    () => new Set(chain.portion?.categories ?? []),
    [chain],
  );
  const [ownPortion, setOwnPortion] = useState(1);
  const portion = controlledPortion ?? ownPortion;
  const setPortion = onPortionChange ?? setOwnPortion;
  useEffect(() => {
    if (portionMax) setPortion((p) => Math.min(Math.max(p, 1), portionMax));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portionMax]);

  // Restore meal from ?m= after mount (SSR renders the empty state).
  // Skipped when controlled: the owner supplied the meal, and re-reading the
  // address bar would overwrite it with whichever side wrote last.
  useEffect(() => {
    if (!syncUrl) {
      hydrated.current = true;
      return;
    }
    // A shared link is restored once, on mount. The rule wants this in a lazy
    // initialiser, which cannot read window during SSR without a hydration
    // mismatch -- so the exception is scoped to the effect rather than chased
    // onto whichever setState the rule names.
    /* eslint-disable react-hooks/set-state-in-effect */
    const q = new URLSearchParams(window.location.search);
    const p = Number(q.get("p"));
    if (Number.isInteger(p) && p > 1) {
      setPortion(p);
    }
    const m = q.get("m");
    if (m) {
      const sel = decodeMeal(m, chain);
      if (Object.keys(sel).length > 0) {
        setSelections(sel);
        setMode(modeOf(chain, sel));
        setOpenCat(null);
      }
    }
    if (chrome === "full") {
      setBarMacro(readBarMacro());
      // Offered, never auto-loaded: a shared link must win, and someone
      // arriving cold expects the empty builder they saw last time.
      if (!m) {
        const stored = readLastOrder(chain.slug);
        const sel = stored ? decodeMeal(stored.m, chain) : {};
        if (stored && Object.keys(sel).length > 0) setLast({ sel, p: stored.p });
      }
    }
    hydrated.current = true;
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror selections into the URL so any meal is a shareable/bookmarkable link.
  //
  // Debounced on purpose: Cloudflare Web Analytics patches the History API and
  // counts every replaceState as a virtual pageview, so writing on each tap
  // reported ~20 "pageviews" for one person building one meal. Waiting for a
  // pause collapses a burst of edits into a single URL write.
  useEffect(() => {
    if (!hydrated.current || !syncUrl) return;
    const t = setTimeout(() => {
      const href = mealUrl(selections, portion);
      if (href !== window.location.href) {
        window.history.replaceState(null, "", href);
      }
      // The same debounce remembers the order on this device. Only a
      // non-empty meal is written: clearing the builder should not erase
      // what was there, so that "Your last order" can bring it back.
      if (chrome === "full" && Object.keys(selections).length > 0) {
        writeLastOrder(chain.slug, encodeMeal(selections), portion);
      }
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [selections, portion, syncUrl, chrome, chain.slug]);

  // While search is open: Escape closes it. On a phone, where the search
  // screen covers the page, the page must not scroll behind it (it would
  // rubber-band under the layer on iOS). On a wide screen search is a
  // dropdown under the field, so the page keeps its scrollbar and a click
  // anywhere outside the field and its panel closes it AND still lands where
  // it was aimed -- "Clear" in the sidebar both ends the search and clears.
  useEffect(() => {
    if (!searchOpen) return;
    const isWide = wide();
    const prev = document.body.style.overflow;
    if (!isWide) document.body.style.overflow = "hidden";
    const close = () => {
      setSearchOpen(false);
      setQuery("");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (isWide && el && !el.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [searchOpen]);

  const totals = useMemo(
    () => mealTotals(chain, selections, activeMode, portion),
    [chain, selections, activeMode, portion],
  );
  // Nutrients no total can be given for, because something picked does not
  // publish them. The label says so rather than printing a summed zero.
  const missing = useMemo(
    () => unknownNutrients(chain, selections),
    [chain, selections],
  );
  // Totals that lean on a figure of ours rather than the chain's.
  const estimated = useMemo(
    () => estimatedNutrients(chain, selections),
    [chain, selections],
  );

  const selectedCount = Object.keys(selections).length;
  // A meal that reached this many components is one somebody used, not one
  // they poked at. Paired with meal-started it gives a completion rate, which
  // is the thing "did the visit work" actually reduces to.
  const builtSent = useRef(false);
  const subtitle = mealSubtitle(
    chain,
    activeMode && activeMode !== defaultMode ? activeMode.name : null,
    portion,
    portionMax,
    selectedCount,
  );

  function toggle(comp: Component, single: boolean) {
    // An add-on rides along with the choice it names; it is not an alternative
    // to it. Clearing the category here would deselect the crust it belongs
    // to, which then drops that crust's size mode, which then prunes the
    // add-on itself -- two clicks and an empty meal.
    const isAddon = !!comp.addon_of;
    // The one funnel step worth counting: did this visit become a meal at all.
    // Fired on the transition out of empty, not per pick, so it stays one
    // event per built meal however many ingredients follow.
    if (selectedCount === 0 && !selections[comp.id]) {
      track("meal-started", { chain: chain.slug });
    }
    // Counted from the gesture rather than from a useEffect on the count: a
    // meal restored from a ?m= link or from the last order arrives complete
    // without anyone building anything, and an effect could not tell those
    // apart. A single-select pick REPLACES its sibling, so it has to be
    // excluded or swapping bread would read as growing the meal.
    if (!builtSent.current && !selections[comp.id]) {
      const replaces =
        single &&
        !isAddon &&
        (byCategory.get(comp.category) ?? []).some(
          (other) => other.id !== comp.id && selections[other.id],
        );
      const after = selectedCount + (replaces ? 0 : 1);
      if (after >= MEAL_BUILT_AT) {
        builtSent.current = true;
        track("meal-built", { chain: chain.slug, items: after });
      }
    }
    setSelections((prev) => {
      const next = { ...prev };
      const adding = !next[comp.id];
      if (!adding) {
        delete next[comp.id];
        return next;
      }
      if (single && !isAddon) {
        for (const other of byCategory.get(comp.category) ?? []) {
          delete next[other.id];
        }
      }
      next[comp.id] = 1;
      return next;
    });
    // Single-select pick in the build flow: advance the accordion, using the
    // visibility of the mode this pick activates (picking Wrap skips Bread).
    if (single && !isAddon && !selections[comp.id]) {
      const modeAfter = comp.size_mode
        ? (modes?.find((m) => m.id === comp.size_mode) ?? defaultMode)
        : activeMode;
      // Only a real transition. A pick with no size_mode leaves modeAfter as
      // the mode already in force, so the common case sends nothing.
      if (modeAfter?.id !== activeMode?.id) {
        track("size-changed", {
          chain: chain.slug,
          size: modeAfter?.id ?? "default",
        });
      }
      const vis = (c: Component) =>
        !c.only_modes ||
        (modeAfter != null && c.only_modes.includes(modeAfter.id));
      const cats = chain.categories.filter(
        (cat) =>
          (cat.flow ?? "build") === "build" &&
          chain.components.some((c) => c.category === cat.id && vis(c)),
      );
      const idx = cats.findIndex((c) => c.id === comp.category);
      // Stay put when picking this row OPENS something on it.
      //
      // A size selector is one such thing: advancing collapses the step before
      // the size is chosen, so getting it wrong means going back. Add-ons are
      // another, and worse -- they only exist once their parent is picked, so
      // advancing shows them and hides them in the same frame. Little Caesars'
      // stuffed crust and Domino's garlic oil both appeared and vanished on
      // the click that revealed them.
      const opens =
        // A LABEL is not a selector. Domino's Pan carries '12" Medium' and has
        // no siblings, so no chips render and there is nothing to hold the
        // step open for -- what matters is whether the row is actually part of
        // a family.
        !!comp.variant_of ||
        chain.components.some((c) => c.variant_of === comp.id) ||
        // `vis`, not isVisible: the add-on is gated on the mode this pick
        // ACTIVATES, which isVisible cannot know because it reads the mode
        // still in effect. Domino's parmesan dusting is only_modes
        // ["md-stuffed"], invisible until the stuffed crust is chosen.
        chain.components.some((c) => c.addon_of === comp.id && vis(c));
      if (idx >= 0 && !opens) {
        setOpenCat(cats[idx + 1]?.id ?? null);
      }
      // A menu item the chain publishes without something opens that step,
      // the same way a build pick advances to the next one.
      if (comp.needs && mode === "menu") setOpenCat(comp.needs);
    }
  }

  const setQty = (id: string, q: number) =>
    setSelections((prev) => ({ ...prev, [id]: q }));

  const clearAll = () => setSelections({});

  /** Drop one pick. No confirm: a mis-tap costs one re-add, and a dialog on
   *  every chip would cost more than the mistake does. */
  const remove = (id: string) =>
    setSelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  // One results block, rendered in the phone's search screen or the desktop
  // dropdown -- never both -- so the two can never disagree.
  const results = (framed: boolean) => searching ? (
    <SearchResults
      framed={framed}
      chain={chain}
      query={query}
      result={found}
      otherPathName={mode === "menu" ? "build-your-own" : "menu-item"}
      stepCats={new Set(owedSteps.map((c) => c.id))}
      selections={selections}
      addonsOf={addonsOf}
      portionCats={portionCats}
      qtySteps={COVERAGE_STEPS}
      qmultFor={rowMult}
      // Wrapped rather than a flag inside toggle(): "did search lead anywhere"
      // is a question about this surface, and only this surface can answer it.
      // Paired with search-opened it is the whole search funnel.
      toggle={(comp, single) => {
        track("search-picked", { chain: chain.slug });
        toggle(comp, single);
      }}
      setQty={setQty}
    />
  ) : (
    <p className="px-1 pt-1 text-xs text-muted">
      Every row on {possessive(chain.name)} chart, sides and drinks included.
      Anything you pick here counts in your meal.
    </p>
  );

  return (
    <div
      // No bottom padding for the floating totals bar: the page owns that
      // clearance, because anything rendered after the builder would otherwise
      // sit below a 112px hole on mobile.
      className={
        chrome === "bare" ? "grid gap-6" : "grid gap-6 lg:grid-cols-[1fr_300px]"
      }
    >
      {/*
        min-w-0 is load-bearing: a grid item defaults to min-width:auto, and
        `truncate` sets white-space:nowrap, so a long component name contributes
        its FULL width to the column's min-content and stretches the page past
        the viewport. Chick-fil-A's "Spicy Southwest Salad w/ Chick-fil-A
        Chick-n-Strips" pushed the mobile layout to 574px in a 390px window.
      */}
      <div className="relative min-w-0 space-y-5">
        {/* Wide screens, while results are showing: the builder column recedes
            behind a dim so the dropdown is unmistakably a layer over the list,
            not one more card in it. The field sits above the dim (its wrapper
            is z-20); the sidebar is outside the column and stays as it is. A
            click on the dim is an outside click and closes the search. */}
        {searchOpen && searching && (
          <div
            aria-hidden
            className="absolute -inset-2 z-10 hidden rounded-3xl bg-bg/70 backdrop-blur-[2px] motion-safe:animate-[fade-in_.2s_ease-out] lg:block"
          />
        )}
        {/* Both of these stand down while searching. Neither belongs to the
            mode, and together they were ~120px of the screen sitting between
            the header and a field that is trying to reach the top of it. */}
        {/* The order this device built here last time, offered back as a one-
            tap start. Present only while nothing is picked and nothing is
            typed; loading it takes the same route a shared link does. */}
        {chrome === "full" && last && selectedCount === 0 && !searching && (
          <LastOrderCard
            chain={chain}
            last={last}
            onLoad={() => {
              track("last-order-loaded", { chain: chain.slug });
              setSelections(last.sel);
              setPortion(last.p);
              setMode(modeOf(chain, last.sel));
              setOpenCat(null);
            }}
            onDismiss={() => {
              clearLastOrder(chain.slug);
              setLast(null);
            }}
          />
        )}
        {/* In the comparison (bare chrome) only the QUESTION renders, never the
            answer. The page above it already says "Start from: Chicken bowl",
            so a row under it reading "Building your own" contradicted the
            preset that had just loaded, its Change link wiped that preset, and
            since only one of the two chains has the row, the two columns' first
            steps sat 60px apart on desktop. */}
        {hasPresets && !searching && (chrome === "full" || mode === null) && (
          <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
            {mode === null ? (
              <>
                <p className="px-1 pb-2 text-sm font-semibold">
                  How do you want to start?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => chooseMode("menu")}
                    className="rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    <span className="block text-sm font-semibold">
                      Start from a menu item
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Exactly as {chain.name} publishes it, then add to it.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseMode("scratch")}
                    className="rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    <span className="block text-sm font-semibold">
                      Build your own
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Compose it ingredient by ingredient.
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-sm font-medium">
                  {mode === "menu"
                    ? "Starting from a menu item"
                    : "Building your own"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelections({});
                    setMode(null);
                    setQuery("");
                    setOpenCat(null);
                  }}
                  className="text-xs font-medium text-accent-strong underline underline-offset-2"
                >
                  Change
                </button>
              </div>
            )}
          </div>
        )}
        {portionMax > 1 && !searching && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-3 py-2 shadow-sm">
            <span className="text-sm font-medium">
              {chain.portion!.unit.charAt(0).toUpperCase() +
                chain.portion!.unit.slice(1)}s eaten
            </span>
            <QtyStepper
              qty={portion}
              onChange={setPortion}
              steps={Array.from({ length: portionMax }, (_, i) => i + 1)}
              format={(q) => String(q)}
            />
            <span className="text-xs text-muted">of {portionMax}</span>
            <button
              type="button"
              onClick={() => setPortion(portion === portionMax ? 1 : portionMax)}
              className="ml-auto text-xs font-medium text-accent-strong underline underline-offset-2"
            >
              {portion === portionMax
                ? `one ${chain.portion!.unit}`
                : `all ${portionMax}`}
            </button>
          </div>
        )}

        {/* Above the flow, not under "Add to it": it reaches the numbered
            steps too, and a box under that heading would claim a scope it does
            not have. The path question still comes first -- somebody arriving
            cold is answering that, not typing. */}
        {pathChosen && (
          <SearchField
            chainName={chain.name}
            rosterCount={reachableCount(families, reachable)}
            value={query}
            onChange={setQuery}
            open={searchOpen}
            onOpen={openSearch}
            onClose={() => {
              setSearchOpen(false);
              setQuery("");
            }}
            matches={found.hits.length}
            wrapRef={wrapRef}
          >
            {results(false)}
          </SearchField>
        )}

        <>
          {/* The numbered steps are one run, not six loose cards: a short rule
              joins each badge to the one above it, so the counter line reads as
              a line. The open step carries the weight. */}
          <div className="space-y-2">
            {owedSteps.map((cat, idx) => (
              <StepSection
                key={cat.id}
                cat={cat}
                comps={visibleByCategory.get(cat.id)!}
                index={idx + 1}
                connect={idx > 0}
                open={openCat === cat.id}
                onToggle={() => setOpenCat(openCat === cat.id ? null : cat.id)}
                selections={selections}
                qtySteps={portionCats.has(cat.id) ? COVERAGE_STEPS : undefined}
                qmultFor={rowMult}
                toggle={toggle}
                setQty={setQty}
                filterable={!pathChosen}
              />
            ))}
          </div>

          {/* Only once something is picked. "Make it a meal" has nothing to
              attach to before there IS a meal, and on Chick-fil-A -- where the
              menu path is one step -- this block rendered second on the page,
              986px tall on a 390px phone, before the visitor had even chosen
              between starting from a menu item and building one. */}
          {featured.length > 0 && mealStarted(chain, selections, owedSteps) && (
            <section className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
              <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {chain.meal_shelf ?? "Make it a meal"}
              </h2>
              <div className="space-y-3">
                {featured.map(({ cat, comps }) => (
                  <div key={cat.id}>
                    <p className="px-1 pb-1 text-xs text-muted">{cat.name}</p>
                    <ul className="space-y-0.5">
                      {comps.map((head) => (
                        <FamilyRow
                          key={head.id}
                          head={head}
                          members={[
                            head,
                            ...(visibleByCategory.get(cat.id) ?? []).filter(
                              (c) => c.variant_of === head.id,
                            ),
                          ]}
                          selections={selections}
                          single={cat.select === "single"}
                          qmultFor={rowMult}
                          toggle={toggle}
                          setQty={setQty}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* One heading over everything additive.

              There used to be two "Add to it" headings 140px apart: the promoted
              categories got one and the extras below got another, so the page
              announced the same thing twice and the only difference between them
              -- step-style card versus accordion -- is an implementation detail.
              Renaming one was not an option either: "Sides, drinks & more" would
              mislabel Jimmy John's Add-ons, which really are things you add. So
              they share a heading and sit next to each other. */}
          {(owedAdds.length > 0 || extraCats.length > 0) && (
            <>
              <h2 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">
                {mode === "menu"
                  ? "Add to it"
                  : "Sides, drinks & other menu items"}
              </h2>
              {mode === "menu" && (
                // Not a hedge -- the honest statement. These charts give a figure
                // for the whole item and never say which ingredients are in it,
                // so hiding the ones we guessed were "already included" would
                // invent the very fact that is missing. Everything stays listed,
                // and this says what adding one means.
                //
                // It used to open "Your pick above is already complete", which is
                // a claim we cannot make for every chain: Chopt and Just Salad
                // both publish their menu salads WITHOUT dressing and say so, so
                // the sentence sat directly under a row reading "no dressing" and
                // contradicted it. Where an item really is incomplete the chain's
                // own words carry it, on the row and in the category note.
                <p className="px-1 pb-1 text-xs leading-relaxed text-muted">
                  {chain.name} does not publish which ingredients are in your
                  pick, so everything stays listed here — anything you add counts
                  on top.
                </p>
              )}
              <div className="space-y-2">
                {owedAdds.map((cat) => (
                  <StepSection
                    key={cat.id}
                    cat={cat}
                    comps={visibleByCategory.get(cat.id)!}
                    connect={false}
                    open={openAdds.includes(cat.id)}
                    onToggle={() => toggleAdd(cat.id)}
                    selections={selections}
                    qtySteps={portionCats.has(cat.id) ? COVERAGE_STEPS : undefined}
                    qmultFor={rowMult}
                    toggle={toggle}
                    setQty={setQty}
                    filterable={!pathChosen}
                  />
                ))}
                {extraCats.map((cat) => (
                  <ExtrasSection
                    key={cat.id}
                    cat={cat}
                    comps={visibleByCategory.get(cat.id)!}
                    selections={selections}
                    toggle={toggle}
                    setQty={setQty}
                    filterable={!pathChosen}
                  />
                ))}
              </div>
            </>
          )}
        </>
      </div>

      {/* Desktop: sticky label column */}
      {chrome === "full" && (
      <aside className="hidden lg:sticky lg:top-[72px] lg:block lg:space-y-2 lg:self-start">
        {selectedCount === 0 ? (
          // Same reasoning as the mobile bar: a zero is a result, and a label
          // of nine zeros over three disabled buttons read as a calculation
          // that had failed rather than one that had not started.
          <div className="rounded-2xl border-2 border-dashed border-line p-5">
            <p className="num text-2xl font-extrabold leading-none tracking-tight">
              Nutrition Facts
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Pick an ingredient to start. The label builds here as you go,
              every figure from {possessive(chain.name)} published data.
            </p>
          </div>
        ) : (
        <>
        <YourPicks
          chain={chain}
          selections={selections}
          activeMode={activeMode}
          portion={portion}
          onRemove={remove}
        />
        <NutritionLabel totals={totals} subtitle={subtitle} missing={missing} estimated={estimated} />
        <ShareMealButton chain={chain} selections={selections} portion={portion} />
        <SaveImageButton
          chain={chain}
          subtitle={subtitle}
          totals={totals}
          selections={selections}
          missing={missing}
          estimated={estimated}
        />
        <CopyLabelButton
          chain={chain}
          modeName={activeMode && activeMode !== defaultMode ? activeMode.name : null}
          selections={selections}
          totals={totals}
          portion={portion}
          portionMax={portionMax}
        />
        <div className="flex items-center justify-between px-1 text-xs text-muted">
          <span>
            {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
          </span>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 hover:text-fg"
            >
              <IconX className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        </>
        )}
      </aside>
      )}

      {/* The phone's search screen. Rendered before the bar so the bar stays
          on top of it: results scroll under the running total, same as the
          page. On a wide screen the same results hang off the field instead
          (see SearchField), so the screen is not mounted there. */}
      {chrome === "full" && searchOpen && !wide() && (
        <SearchLayer
          chainName={chain.name}
          rosterCount={reachableCount(families, reachable)}
          value={query}
          onChange={setQuery}
          onClose={() => {
            setSearchOpen(false);
            setQuery("");
          }}
          matches={found.hits.length}
          inputRef={inputRef}
        >
          {results(true)}
        </SearchLayer>
      )}

      {/* Mobile: floating totals bar + slide-up label sheet */}
      {chrome === "full" && labelOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setLabelOpen(false)}
          aria-hidden
        />
      )}
      {chrome === "full" && (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 lg:hidden">
        <div className="pointer-events-auto mx-auto max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {labelOpen && (
            <div className="mb-2 max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-line">
              <YourPicks
                chain={chain}
                selections={selections}
                activeMode={activeMode}
                portion={portion}
                onRemove={remove}
              />
              <NutritionLabel totals={totals} subtitle={subtitle} missing={missing} estimated={estimated} />
              <ShareMealButton chain={chain} selections={selections} portion={portion} />
              <SaveImageButton
                chain={chain}
                subtitle={subtitle}
                totals={totals}
                selections={selections}
                missing={missing}
                estimated={estimated}
              />
              <CopyLabelButton
                chain={chain}
                modeName={activeMode && activeMode !== defaultMode ? activeMode.name : null}
                selections={selections}
                totals={totals}
                portion={portion}
                portionMax={portionMax}
              />
              {/* Which macro rides beside calories on the bar below. Lives in
                  the sheet the bar opens, so the setting sits next to the
                  thing it changes. Protein-first people exist; so do
                  sodium-first ones. */}
              <div className="flex flex-wrap items-center gap-x-1 px-1 pt-1 text-xs text-muted">
                <span className="mr-2">Bar shows</span>
                {/* Words, not bubbles: four pills in a 300px row touched
                    their own text, and the active one is told by weight and
                    an underline in the brand colour rather than a border. */}
                {BAR_MACROS.map((b) => (
                  <button
                    key={b.field}
                    type="button"
                    aria-pressed={b.field === barMacro}
                    onClick={() => {
                      setBarMacro(b.field);
                      writeBarMacro(b.field);
                    }}
                    className={`min-h-9 px-2 underline-offset-[6px] transition-colors ${
                      b.field === barMacro
                        ? "font-semibold text-fg underline decoration-brand decoration-2"
                        : "hover:text-fg"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex h-9 w-full items-center justify-center gap-1 text-xs text-muted"
                >
                  <IconX className="h-3 w-3" /> Clear meal
                </button>
              )}
            </div>
          )}
          {/*
            The bar is the only way to the label, Share, Save-as-image and
            Copy-for-Lose-It! on a phone, so it has to read as a control: a grab
            handle above the content, and a chevron that turns.

            With nothing picked it says so rather than showing "0 cal" -- a zero
            is a result, and presenting the empty state as one made the first
            thing a visitor saw look like a failed calculation.

            The empty bar sits on the page background and only lights up teal
            once there is a real total to show, so the colour means "this is
            your number" rather than "this is a bar". Both states are the same
            height and the same shape, so nothing jumps when the first
            ingredient lands -- that jump, not the colour, was what made the
            empty state read as unfinished.
          */}
          <div
            className={`relative flex min-h-14 w-full items-stretch rounded-2xl shadow-lg transition-colors ${
              selectedCount === 0
                ? "border border-line bg-surface text-fg"
                : "bg-brand text-on-brand shadow-brand/30"
            }`}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-current opacity-30"
            />
            {/* Search rides on the bar: it is the one piece of chrome that is
                unmistakably about this menu, and the thumb is already there.
                A header icon was tried first and read as "search the site".
                Always present, so nothing appears or vanishes as you scroll;
                a divider keeps the two actions from blurring into one. */}
            {pathChosen && (
              <>
                <button
                  type="button"
                  onClick={openSearch}
                  aria-label={`Search ${possessive(chain.name)} menu`}
                  className="flex w-12 shrink-0 items-center justify-center rounded-l-2xl transition-colors hover:bg-black/10"
                >
                  <IconSearch className="h-5 w-5" />
                </button>
                <span aria-hidden className="my-3 w-px self-stretch bg-current opacity-25" />
              </>
            )}
          <button
            type="button"
            onClick={() => {
              if (!labelOpen) {
                track("label-opened", { chain: chain.slug, items: selectedCount });
              }
              setLabelOpen((v) => !v);
            }}
            aria-expanded={labelOpen}
            aria-label={
              labelOpen
                ? "Hide the nutrition label"
                : "Show the nutrition label"
            }
            className="flex min-w-0 flex-1 items-center rounded-r-2xl px-4 pb-3 pt-4 text-left"
          >
            <span className="flex w-full items-center justify-between gap-3">
              {/*
                Both states are one line at every width, which is what keeps
                them the same height. The trailing detail is dropped below
                380px instead of being allowed to wrap: measured, the full
                macro line is 180px and a 360px phone -- a very common Android
                width -- leaves 304px for a 85px total, 180px of macros, the
                chevron and two gaps. It wrapped, and the bar grew by 14px the
                moment the first ingredient landed.
              */}
              {selectedCount === 0 ? (
                // One phrase, not a heading plus a hint: with the search
                // button on the bar there is ~260px left on a 390px phone,
                // and "Nutrition Facts · Pick an ingredient to start" no
                // longer fits it. The handle and chevron carry "this opens";
                // the words carry what to do first.
                <span className="min-w-0 truncate text-sm font-semibold">
                  Pick an ingredient to start
                </span>
              ) : (
                <>
                  <span className="num shrink-0 text-xl font-extrabold leading-none">
                    {show(totals.calories)} cal
                  </span>
                  {/* The item count leads, because the sheet this opens now
                      holds an editable list of those items and nothing else on
                      the bar hinted that there was anything in there to edit.
                      The macros keep the wider phones. */}
                  <span className="num min-w-0 truncate text-xs opacity-90">
                    {selectedCount} item{selectedCount === 1 ? "" : "s"}
                    <span className="hidden min-[380px]:inline">
                      {" · "}
                      {show(totals[barMacro], bar.unit === "mg" ? 0 : 1)}
                      {bar.unit} {bar.label}
                    </span>
                  </span>
                </>
              )}
              <IconChevron
                aria-hidden
                className={`h-5 w-5 shrink-0 transition-transform ${labelOpen ? "rotate-90" : "-rotate-90"}`}
              />
            </span>
          </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * "Your last order here", as a card with one action.
 *
 * Names and a calorie figure, computed from the stored meal against the live
 * chain file -- so if the chain has since dropped an item, the card shows
 * what is still there and loading it gives exactly that.
 */
function LastOrderCard({
  chain,
  last,
  onLoad,
  onDismiss,
}: {
  chain: Chain;
  last: { sel: Selections; p: number };
  onLoad: () => void;
  onDismiss: () => void;
}) {
  const mode = activeSizeMode(chain, last.sel);
  const lines = mealLines(chain, last.sel, mode, last.p);
  const totals = mealTotals(chain, last.sel, mode, last.p);
  if (lines.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">Your last order here</p>
        <p className="truncate text-xs text-muted">
          {lines.map((l) => l.comp.name).join(" + ")}
        </p>
        <p className="num text-xs text-muted">
          {show(totals.calories)} cal · {lines.length} item{lines.length === 1 ? "" : "s"}
        </p>
      </div>
      <button
        type="button"
        onClick={onLoad}
        className="min-h-9 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-strong"
      >
        Load
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Forget this order"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
