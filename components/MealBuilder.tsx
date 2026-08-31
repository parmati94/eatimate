"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Chain, Component, Totals } from "@/lib/schema";
import { NUTRIENT_FIELDS } from "@/lib/schema";
import {
  roundCalories,
  roundCholesterol,
  roundFat,
  roundGrams,
  roundSodium,
} from "@/lib/rounding";
import NutritionLabel from "./NutritionLabel";
import {
  IconCheck,
  IconChevron,
  IconCopy,
  IconMinus,
  IconPlus,
  IconSearch,
  IconX,
} from "./icons";

// Extended so per-piece items (wings, tenders) can reach real order sizes.
const QTY_STEPS = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20];
const SEARCH_THRESHOLD = 14;
/** Quiet period before mirroring selections into the URL (see the sync effect). */
const URL_SYNC_DELAY_MS = 600;

type Selections = Record<string, number>; // component id -> qty multiplier

function emptyTotals(): Totals {
  return Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, 0])) as Totals;
}

function fmtQty(q: number): string {
  return q === 0.5 ? "½×" : `${q}×`;
}

// ---- URL meal state: /chain?m=id,id:0.5,id:2 ------------------------------

/**
 * The shareable URL for a meal, computed from state rather than read back out
 * of the address bar -- the effect below writes there on a delay, so
 * window.location can trail the current selections by a moment.
 */
function mealUrl(sel: Selections): string {
  const url = new URL(window.location.href);
  const encoded = encodeMeal(sel);
  if (encoded) url.searchParams.set("m", encoded);
  else url.searchParams.delete("m");
  return url.href;
}

function encodeMeal(sel: Selections): string {
  return Object.entries(sel)
    .map(([id, q]) => (q === 1 ? id : `${id}:${q}`))
    .join(",");
}

function decodeMeal(raw: string, chain: Chain): Selections {
  const valid = new Map(chain.components.map((c) => [c.id, c]));
  const sel: Selections = {};
  for (const part of raw.split(",")) {
    const [id, qRaw] = part.split(":");
    const q = qRaw === undefined ? 1 : Number(qRaw);
    if (valid.has(id) && QTY_STEPS.includes(q)) sel[id] = q;
  }
  return sel;
}

// ---------------------------------------------------------------------------

function QtyStepper({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (q: number) => void;
}) {
  const i = QTY_STEPS.indexOf(qty);
  const btn =
    "flex h-9 w-9 items-center justify-center text-accent-strong transition-colors hover:bg-accent-soft disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <span
      className="inline-flex items-center overflow-hidden rounded-full border border-line bg-surface shadow-sm"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Less"
        disabled={i <= 0}
        onClick={() => onChange(QTY_STEPS[i - 1])}
        className={btn}
      >
        <IconMinus className="h-4 w-4" />
      </button>
      <span className="min-w-8 text-center text-xs font-semibold tabular-nums">
        {fmtQty(qty)}
      </span>
      <button
        type="button"
        aria-label="More"
        disabled={i >= QTY_STEPS.length - 1}
        onClick={() => onChange(QTY_STEPS[i + 1])}
        className={btn}
      >
        <IconPlus className="h-4 w-4" />
      </button>
    </span>
  );
}

function ComponentRow({
  comp,
  qty,
  single,
  qmult = 1,
  onToggle,
  onQty,
  variants,
  onVariant,
}: {
  comp: Component;
  qty: number | undefined;
  single: boolean;
  qmult?: number;
  onToggle: () => void;
  onQty: (q: number) => void;
  /** All members of this size family, head first. Absent when there is only one. */
  variants?: Component[];
  onVariant?: (next: Component) => void;
}) {
  const selected = !!qty;
  return (
    <li>
      <div
        role={single ? "radio" : "checkbox"}
        aria-checked={selected}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
          selected ? "bg-accent-soft" : "hover:bg-surface-2"
        }`}
      >
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors ${
            single ? "rounded-full" : "rounded-md"
          } ${
            selected
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-surface"
          }`}
        >
          {selected && <IconCheck className="h-3 w-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium leading-snug">
            {comp.name}
          </span>
          <span className="block text-xs text-muted">
            {comp.serving_desc}
            {qmult !== 1 && (
              <span className="ml-1 font-semibold text-accent-strong">
                ×{qmult}
              </span>
            )}
          </span>
          {variants && variants.length > 1 && (
            // Sizes sit inside the row, so a family reads as one choice. Clicks
            // must not bubble to the row's own toggle handler.
            <span
              className="mt-1 flex flex-wrap gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {variants.map((v) => {
                const active = v.id === comp.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onVariant?.(v)}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-muted hover:border-accent hover:text-accent-strong"
                    }`}
                  >
                    {v.variant_label}
                  </button>
                );
              })}
            </span>
          )}
        </span>
        {selected ? (
          <QtyStepper qty={qty} onChange={onQty} />
        ) : (
          <span className="text-xs tabular-nums text-muted">
            {Math.round(comp.calories * qmult)} cal
          </span>
        )}
      </div>
    </li>
  );
}

function CategoryBody({
  cat,
  comps,
  selections,
  qmultFor = () => 1,
  toggle,
  setQty,
}: {
  cat: Category;
  comps: Component[];
  selections: Selections;
  qmultFor?: (comp: Component) => number;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const single = cat.select === "single";
  // Collapse size families ("Small/Medium/Large Fries") into one row carrying a
  // size selector. Members share a name, so filtering keeps a family together.
  const families = useMemo(() => {
    const kids = new Map<string, Component[]>();
    for (const c of comps) {
      if (!c.variant_of) continue;
      kids.set(c.variant_of, [...(kids.get(c.variant_of) ?? []), c]);
    }
    return comps
      .filter((c) => !c.variant_of)
      .map((head) => ({ head, members: [head, ...(kids.get(head.id) ?? [])] }));
  }, [comps]);
  const shown = filter
    ? families.filter((f) =>
        f.head.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : families;
  return (
    <div className="px-2 pb-2">
      {comps.length > SEARCH_THRESHOLD && (
        <label className="relative mb-1 block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            suppressHydrationWarning // Chrome iOS autofill injects __gcruniqueid
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${cat.name.toLowerCase()}…`}
            className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
        </label>
      )}
      <ul className="space-y-0.5">
        {shown.map(({ head, members }) => {
          // The row shows whichever size is selected, else the default size.
          const active = members.find((m) => selections[m.id]) ?? head;
          return (
            <ComponentRow
              key={head.id}
              comp={active}
              qty={selections[active.id]}
              single={single}
              qmult={qmultFor(active)}
              onToggle={() => toggle(active, single)}
              onQty={(q) => setQty(active.id, q)}
              variants={members.length > 1 ? members : undefined}
              onVariant={(next) => {
                if (next.id === active.id) return;
                const qty = selections[active.id];
                // Switching size moves the selection rather than adding a second
                // row, and carries the quantity across.
                if (qty) {
                  setQty(active.id, 0);
                  setQty(next.id, qty);
                }
              }}
            />
          );
        })}
        {shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted">No matches.</li>
        )}
      </ul>
    </div>
  );
}

/** Display name including its size, so "Fries" never loses which one. */
function fullName(c: Component): string {
  return c.variant_label ? `${c.name} (${c.variant_label})` : c.name;
}

function picksSummary(comps: Component[], selections: Selections): string {
  const picked = comps.filter((c) => selections[c.id]);
  if (picked.length === 0) return "";
  return picked
    .map((c) => {
      const q = selections[c.id];
      return q === 1 ? fullName(c) : `${fmtQty(q)} ${fullName(c)}`;
    })
    .join("  +  ");
}

function labelText(
  chain: Chain,
  modeName: string | null,
  picked: Component[],
  sel: Selections,
  totals: Totals,
  url: string,
): string {
  const items = picked
    .map((c) =>
      sel[c.id] === 1 ? fullName(c) : `${fmtQty(sel[c.id])} ${fullName(c)}`,
    )
    .join(", ");
  return [
    `${chain.name}${modeName ? ` — ${modeName}` : ""} (built on eatimate)`,
    items,
    ``,
    `Calories: ${roundCalories(totals.calories)}`,
    `Total Fat: ${roundFat(totals.fat_g)} g`,
    `Saturated Fat: ${roundFat(totals.sat_fat_g)} g`,
    `Trans Fat: ${roundFat(totals.trans_fat_g)} g`,
    `Cholesterol: ${roundCholesterol(totals.cholesterol_mg)} mg`,
    `Sodium: ${roundSodium(totals.sodium_mg)} mg`,
    `Total Carbohydrate: ${roundGrams(totals.carbs_g)} g`,
    `Dietary Fiber: ${roundGrams(totals.fiber_g)} g`,
    `Total Sugars: ${roundGrams(totals.sugars_g)} g`,
    `Protein: ${roundGrams(totals.protein_g)} g`,
    ``,
    url,
  ].join("\n");
}

/**
 * Copy with fallbacks: navigator.clipboard only exists in secure contexts
 * (https / localhost), so on a plain-http LAN dev URL (phone testing) fall back
 * to the legacy execCommand path, and as a last resort show the text to copy.
 */
function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    );
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS needs an explicit range
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyLabelButton({
  chain,
  modeName,
  selections,
  totals,
}: {
  chain: Chain;
  modeName: string | null;
  selections: Selections;
  totals: Totals;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [text, setText] = useState("");
  const picked = chain.components.filter((c) => selections[c.id]);
  if (picked.length === 0) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={async () => {
          const t = labelText(
            chain,
            modeName,
            picked,
            selections,
            totals,
            mealUrl(selections),
          );
          setText(t);
          if (await copyText(t)) {
            setState("copied");
            setTimeout(() => setState("idle"), 1500);
          } else {
            setState("manual");
          }
        }}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium shadow-sm transition-colors hover:border-accent hover:text-accent-strong"
      >
        {state === "copied" ? (
          <>
            <IconCheck className="h-4 w-4 text-accent-strong" /> Copied
          </>
        ) : (
          <>
            <IconCopy className="h-4 w-4" /> Copy label as text
          </>
        )}
      </button>
      {state === "manual" && (
        <div className="space-y-1">
          <p className="px-1 text-xs text-muted">
            Couldn&apos;t access the clipboard — select and copy below.
          </p>
          <textarea
            readOnly
            value={text}
            rows={6}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-xl border border-line bg-surface-2 p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  index,
  name,
  count,
  summary,
  open,
  onClick,
}: {
  index?: number;
  name: string;
  count: number;
  summary: string;
  open: boolean;
  onClick?: () => void;
}) {
  const done = !!summary;
  const badge =
    index !== undefined ? (
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          done
            ? "bg-accent text-on-accent"
            : open
              ? "bg-fg text-bg"
              : "bg-surface-2 text-muted"
        }`}
      >
        {done ? <IconCheck className="h-3.5 w-3.5" /> : index}
      </span>
    ) : null;
  const inner = (
    <>
      {badge}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-muted">{count}</span>
        </span>
        {summary && !open && (
          <span className="block truncate text-xs font-medium text-accent-strong">
            {summary}
          </span>
        )}
      </span>
      <IconChevron
        className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
      />
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={open} className={cls}>
      {inner}
    </button>
  ) : (
    <summary className={`${cls} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
      {inner}
    </summary>
  );
}

function ExtrasSection({
  cat,
  comps,
  selections,
  toggle,
  setQty,
}: {
  cat: Category;
  comps: Component[];
  selections: Selections;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-2xl border border-line bg-surface shadow-sm"
    >
      <SectionHeader
        name={cat.name}
        count={comps.length}
        summary={picksSummary(comps, selections)}
        open={open}
      />
      <CategoryBody
        cat={cat}
        comps={comps}
        selections={selections}
        toggle={toggle}
        setQty={setQty}
      />
    </details>
  );
}

export default function MealBuilder({ chain }: { chain: Chain }) {
  const [selections, setSelections] = useState<Selections>({});
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
  const defaultMode = modes?.find((m) => m.default) ?? modes?.[0] ?? null;
  const activeMode = useMemo(() => {
    if (!modes) return null;
    for (const c of chain.components) {
      if (selections[c.id] && c.size_mode) {
        return modes.find((m) => m.id === c.size_mode) ?? defaultMode;
      }
    }
    return defaultMode;
  }, [modes, defaultMode, chain, selections]);
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

  // Presets open the numbered flow: on a "name and tweak" chain you start from
  // a published menu item, then add to it. Chains without presets are unchanged.
  const presetCats = chain.categories.filter(
    (c) => c.flow === "preset" && visibleByCategory.has(c.id),
  );
  const buildCats = [
    ...presetCats,
    ...chain.categories.filter(
      (c) => (c.flow ?? "build") === "build" && visibleByCategory.has(c.id),
    ),
  ];
  const extraCats = chain.categories.filter(
    (c) => c.flow === "extras" && visibleByCategory.has(c.id),
  );

  const [openCat, setOpenCat] = useState<string | null>(
    buildCats[0]?.id ?? null,
  );

  // Changing the format prunes picks that are no longer offered (switching
  // to Wrap drops a selected loaf, etc.).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile after mode change
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

  // Restore meal from ?m= after mount (SSR renders the empty state).
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("m");
    if (m) {
      const sel = decodeMeal(m, chain);
      if (Object.keys(sel).length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from URL after mount
        setSelections(sel);
        setOpenCat(null);
      }
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror selections into the URL so any meal is a shareable/bookmarkable link.
  //
  // Debounced on purpose: Cloudflare Web Analytics patches the History API and
  // counts every replaceState as a virtual pageview, so writing on each tap
  // reported ~20 "pageviews" for one person building one meal. Waiting for a
  // pause collapses a burst of edits into a single URL write.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      const href = mealUrl(selections);
      if (href !== window.location.href) {
        window.history.replaceState(null, "", href);
      }
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [selections]);

  const totals = useMemo(() => {
    const t = emptyTotals();
    for (const c of chain.components) {
      const qty = selections[c.id];
      if (!qty) continue;
      const k = qty * (activeMode?.multipliers[c.category] ?? 1);
      for (const f of NUTRIENT_FIELDS) t[f] += c[f] * k;
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, selections, activeMode]);

  const selectedCount = Object.keys(selections).length;

  function toggle(comp: Component, single: boolean) {
    setSelections((prev) => {
      const next = { ...prev };
      const adding = !next[comp.id];
      if (!adding) {
        delete next[comp.id];
        return next;
      }
      if (single) {
        for (const other of byCategory.get(comp.category) ?? []) {
          delete next[other.id];
        }
      }
      next[comp.id] = 1;
      return next;
    });
    // Single-select pick in the build flow: advance the accordion, using the
    // visibility of the mode this pick activates (picking Wrap skips Bread).
    if (single && !selections[comp.id]) {
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
      if (idx >= 0) setOpenCat(cats[idx + 1]?.id ?? null);
    }
  }

  const setQty = (id: string, q: number) =>
    setSelections((prev) => ({ ...prev, [id]: q }));

  const clearAll = () => setSelections({});

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[1fr_300px] lg:pb-0">
      {/*
        min-w-0 is load-bearing: a grid item defaults to min-width:auto, and
        `truncate` sets white-space:nowrap, so a long component name contributes
        its FULL width to the column's min-content and stretches the page past
        the viewport. Chick-fil-A's "Spicy Southwest Salad w/ Chick-fil-A
        Chick-n-Strips" pushed the mobile layout to 574px in a 390px window.
      */}
      <div className="min-w-0 space-y-5">
        <div className="space-y-2">
          {buildCats.map((cat, idx) => {
            const comps = visibleByCategory.get(cat.id)!;
            const open = openCat === cat.id;
            return (
              <section
                key={cat.id}
                className={`rounded-2xl border bg-surface shadow-sm transition-colors ${
                  open ? "border-accent/60" : "border-line"
                }`}
              >
                <SectionHeader
                  index={idx + 1}
                  name={cat.name}
                  count={comps.length}
                  summary={picksSummary(comps, selections)}
                  open={open}
                  onClick={() => setOpenCat(open ? null : cat.id)}
                />
                {open && (
                  <>
                    {cat.note && (
                      <p className="px-4 pb-1 text-xs leading-relaxed text-muted">
                        {cat.note}
                      </p>
                    )}
                    <CategoryBody
                      cat={cat}
                      comps={comps}
                      selections={selections}
                      qmultFor={rowMult}
                      toggle={toggle}
                      setQty={setQty}
                    />
                  </>
                )}
              </section>
            );
          })}
        </div>

        {extraCats.length > 0 && (
          <>
            <h2 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">
              Sides, drinks &amp; other menu items
            </h2>
            <div className="space-y-2">
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
      <aside className="hidden lg:sticky lg:top-[72px] lg:block lg:space-y-2 lg:self-start">
        <NutritionLabel totals={totals} />
        <CopyLabelButton
          chain={chain}
          modeName={activeMode && activeMode !== defaultMode ? activeMode.name : null}
          selections={selections}
          totals={totals}
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

      {/* Mobile: floating totals bar + slide-up label sheet */}
      {labelOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setLabelOpen(false)}
          aria-hidden
        />
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 lg:hidden">
        <div className="pointer-events-auto mx-auto max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {labelOpen && (
            <div className="mb-2 max-h-[70vh] space-y-2 overflow-y-auto rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-line">
              <NutritionLabel totals={totals} />
              <CopyLabelButton
                chain={chain}
                modeName={activeMode && activeMode !== defaultMode ? activeMode.name : null}
                selections={selections}
                totals={totals}
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
          <button
            type="button"
            onClick={() => setLabelOpen((v) => !v)}
            aria-expanded={labelOpen}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-accent px-4 text-on-accent shadow-lg shadow-accent/30"
          >
            <span className="text-lg font-bold tabular-nums">
              {roundCalories(totals.calories)} cal
            </span>
            <span className="text-xs tabular-nums opacity-90">
              {roundGrams(totals.protein_g)}g protein ·{" "}
              {roundGrams(totals.carbs_g)}g carbs · {roundGrams(totals.fat_g)}g
              fat
            </span>
            <IconChevron
              className={`h-5 w-5 transition-transform ${labelOpen ? "rotate-90" : "-rotate-90"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
