"use client";

import {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
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
  estimatedNutrients,
  mealSubtitle,
  mealTotals,
  unknownNutrients
} from "@/lib/meal";
import NutritionLabel from "./NutritionLabel";
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
  IconX
} from "./icons";

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

  // On a "name and tweak" chain the two paths are mutually exclusive: you
  // either start from a published menu item OR compose one from parts. Stacking
  // them in one numbered flow reads as building a second sandwich.
  const presetCats = chain.categories.filter(
    (c) => (c.flow === "preset" || c.flow === "both") && visibleByCategory.has(c.id),
  );
  const scratchCats = chain.categories.filter(
    (c) =>
      ((c.flow ?? "build") === "build" || c.flow === "both") &&
      visibleByCategory.has(c.id),
  );
  const hasPresets = presetCats.length > 0;
  /**
   * Which path a ready-made set of selections belongs to.
   *
   * A comparison preloads a build, and a shared ?m= link restores one, but
   * neither carried a mode -- so a chain that asks "how do you want to start?"
   * showed that question with the meal already selected behind it and the
   * total already counting it. If anything picked is preset-only, the meal came
   * off the menu; otherwise it was built.
   */
  const modeOf = (sel: Selections) => {
    const ids = Object.keys(sel);
    if (!ids.length) return null;
    const flow = new Map(chain.categories.map((c) => [c.id, c.flow ?? "build"]));
    return chain.components.some(
      (c) => sel[c.id] && flow.get(c.category) === "preset",
    )
      ? ("menu" as const)
      : ("scratch" as const);
  };

  const [mode, setMode] = useState<"menu" | "scratch" | null>(
    chain.default_flow === "build"
      ? "scratch"
      : chain.default_flow === "menu"
        ? "menu"
        : null,
  );
  // A preloaded comparison never mounts empty, so this settles it before paint
  // rather than in an effect that would flash the chooser first.
  //
  // A meal in hand BEATS default_flow, which is only a guess at what someone
  // arriving cold would want. Little Caesars defaults to building, so the pizza
  // comparison mounted it on the build path where its preset pepperoni does not
  // render -- the calories counted while nothing on screen looked chosen.
  const [modeSettled, setModeSettled] = useState(false);
  if (!modeSettled && hasPresets) {
    const m = modeOf(selections);
    if (m && m !== mode) setMode(m);
    setModeSettled(true);
  }

  const buildCats = !hasPresets
    ? scratchCats
    : mode === "menu"
      ? presetCats
      : mode === "scratch"
        ? scratchCats
        : [];
  // On the menu path, where the numbered run stops being a sequence of choices
  // and becomes a list of things you may add.
  //
  // Everything AFTER the last `preset` category is additive: Potbelly's bread
  // is `both` and comes first because a sandwich has no size until you pick
  // one, but its toppings come after the sandwich and are extra. Without the
  // break, "2 Protein" under a chosen B.M.T. reads as "now choose your meat",
  // which is the opposite of what starting from a menu item means.
  const lastPreset = buildCats.map((c) => c.flow).lastIndexOf("preset");
  const splitAt =
    mode === "menu" && lastPreset >= 0 ? lastPreset + 1 : buildCats.length;
  /** The steps you owe: on the menu path, up to and including the menu item. */
  const stepCats = buildCats.slice(0, splitAt);
  /** Promoted categories that are only ever additive once a menu item is picked. */
  const addCats = buildCats.slice(splitAt);

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

  const plainExtras = chain.categories.filter(
    (c) => c.flow === "extras" && visibleByCategory.has(c.id),
  );
  // Started from a menu item? Everything else becomes something you can add.
  // Which of those are "already in it" is not published, so the page shows the
  // full list and says so, rather than us guessing on the customer's behalf.
  // Starting from a menu item, the build steps become "add to it" -- except
  // the "both" ones, which are already numbered steps of this path.
  const extraCats =
    mode === "menu"
      ? [
          ...scratchCats.filter((c) => c.flow !== "both" && !c.in_preset),
          ...plainExtras,
        ]
      : plainExtras;

  const [openCat, setOpenCat] = useState<string | null>(
    buildCats[0]?.id ?? null,
  );

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
        setMode(modeOf(sel));
        setOpenCat(null);
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
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [selections, portion, syncUrl]);

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
    }
  }

  const setQty = (id: string, q: number) =>
    setSelections((prev) => ({ ...prev, [id]: q }));

  const clearAll = () => setSelections({});

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
      <div className="min-w-0 space-y-5">
        {hasPresets && (
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
        {portionMax > 1 && (
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

        {/* The numbered steps are one run, not six loose cards: a short rule
            joins each badge to the one above it, so the counter line reads as
            a line. The open step carries the weight. */}
        <div className="space-y-2">
          {stepCats.map((cat, idx) => (
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
            />
          ))}
        </div>

        {/* Only once something is picked. "Make it a meal" has nothing to
            attach to before there IS a meal, and on Chick-fil-A -- where the
            menu path is one step -- this block rendered second on the page,
            986px tall on a 390px phone, before the visitor had even chosen
            between starting from a menu item and building one. */}
        {featured.length > 0 && selectedCount > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
            <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Make it a meal
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
                        // Live, like the extras accordions and unlike a
                        // numbered step: a drink on this shelf is chosen BY
                        // its size, so the sizes have to be visible to choose
                        // between. Stated rather than left to the default --
                        // this is the second place that renders a chip row,
                        // and the last two bugs in this component were one
                        // concept with two call sites drifting apart.
                        chipsOnPick={false}
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
        {(addCats.length > 0 || extraCats.length > 0) && (
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
              <p className="px-1 pb-1 text-xs leading-relaxed text-muted">
                Your pick above is already complete. {chain.name} does not
                publish which ingredients are in it, so everything stays listed
                here — anything you add counts on top.
              </p>
            )}
            <div className="space-y-2">
              {addCats.map((cat) => (
                <StepSection
                  key={cat.id}
                  cat={cat}
                  comps={visibleByCategory.get(cat.id)!}
                  connect={false}
                  open={openCat === cat.id}
                  onToggle={() => setOpenCat(openCat === cat.id ? null : cat.id)}
                  selections={selections}
                  qtySteps={portionCats.has(cat.id) ? COVERAGE_STEPS : undefined}
                  qmultFor={rowMult}
                  toggle={toggle}
                  setQty={setQty}
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
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Desktop: sticky label column */}
      {chrome === "full" && (
      <aside className="hidden lg:sticky lg:top-[72px] lg:block lg:space-y-2 lg:self-start">
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
      </aside>
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
          <button
            type="button"
            onClick={() => setLabelOpen((v) => !v)}
            aria-expanded={labelOpen}
            aria-label={
              labelOpen
                ? "Hide the nutrition label"
                : "Show the nutrition label"
            }
            className={`flex min-h-14 w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-4 pb-3 pt-2 shadow-lg transition-colors ${
              selectedCount === 0
                ? "border border-line bg-surface text-fg"
                : "bg-brand text-on-brand shadow-brand/30"
            }`}
          >
            <span
              aria-hidden
              className="h-1 w-9 shrink-0 rounded-full bg-current opacity-30"
            />
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
                <>
                  <span className="num shrink-0 text-base font-extrabold leading-none">
                    Nutrition Facts
                  </span>
                  <span className="min-w-0 truncate text-xs text-muted">
                    Pick an ingredient
                    <span className="hidden min-[380px]:inline"> to start</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="num shrink-0 text-xl font-extrabold leading-none">
                    {show(totals.calories)} cal
                  </span>
                  <span className="num min-w-0 truncate text-xs opacity-90">
                    {show(totals.protein_g, 1)}g protein
                    <span className="hidden min-[380px]:inline">
                      {" · "}
                      {show(totals.carbs_g, 1)}g carbs ·{" "}
                      {show(totals.fat_g, 1)}g fat
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
      )}
    </div>
  );
}
