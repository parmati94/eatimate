"use client";

import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Chain, Component, Totals } from "@/lib/schema";
import {
  show,
} from "@/lib/rounding";
import {
  COVERAGE_STEPS,
  QTY_STEPS,
  Selections,
  activeSizeMode,
  decodeMeal,
  defaultSizeMode,
  encodeMeal,
  estimatedNutrients,
  mealSubtitle,
  mealTotals,
  unknownNutrients,
} from "@/lib/meal";
import { copyText } from "@/lib/clipboard";
import { drawLabel } from "@/lib/labelImage";
import NutritionLabel from "./NutritionLabel";
import {
  IconCheck,
  IconChevron,
  IconCopy,
  IconDownload,
  IconShare,
  IconMinus,
  IconPlus,
  IconSearch,
  IconX,
} from "./icons";

const SEARCH_THRESHOLD = 14;
/** Quiet period before mirroring selections into the URL (see the sync effect). */
const URL_SYNC_DELAY_MS = 600;

function fmtQty(q: number): string {
  return q === 0.5 ? "½×" : `${q}×`;
}

// ---- URL meal state: /chain?m=id,id:0.5,id:2 ------------------------------

/**
 * The shareable URL for a meal, computed from state rather than read back out
 * of the address bar -- the effect below writes there on a delay, so
 * window.location can trail the current selections by a moment.
 */
function mealUrl(sel: Selections, portion = 1): string {
  const url = new URL(window.location.href);
  const encoded = encodeMeal(sel);
  if (encoded) url.searchParams.set("m", encoded);
  else url.searchParams.delete("m");
  if (portion > 1) url.searchParams.set("p", String(portion));
  else url.searchParams.delete("p");
  return url.href;
}

// ---------------------------------------------------------------------------

function QtyStepper({
  qty,
  onChange,
  steps = QTY_STEPS,
  format = fmtQty,
}: {
  qty: number;
  onChange: (q: number) => void;
  steps?: number[];
  /** A count reads as "3", a multiplier as "3×". */
  format?: (q: number) => string;
}) {
  const i = steps.indexOf(qty);
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
        onClick={() => onChange(steps[i - 1])}
        className={btn}
      >
        <IconMinus className="h-4 w-4" />
      </button>
      <span className="min-w-8 text-center text-xs font-semibold tabular-nums">
        {format(qty)}
      </span>
      <button
        type="button"
        aria-label="More"
        disabled={i >= steps.length - 1}
        onClick={() => onChange(steps[i + 1])}
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
  qtySteps,
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
  qtySteps?: number[];
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
            {comp.derived && (
              <span
                className="ml-1 rounded bg-surface-2 px-1 py-px text-[10px] font-medium uppercase tracking-wide"
                title={comp.derived}
              >
                derived
              </span>
            )}
            {comp.cholesterol_mg == null && (
              <span
                className="ml-1 rounded bg-surface-2 px-1 py-px text-[10px] font-medium uppercase tracking-wide"
                title="This chain does not publish cholesterol for this item, so a meal containing it has no cholesterol total."
              >
                no cholesterol figure
              </span>
            )}
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
        {selected && <QtyStepper qty={qty} onChange={onQty} steps={qtySteps} />}
        {/* Always shown: comparing sizes is the whole point of the size
            buttons, and it is the selected row you are comparing. Stays last
            so the calorie column lines up whether or not a row is selected. */}
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">
          {Math.round(comp.calories * qmult)} cal
        </span>
      </div>
    </li>
  );
}

function CategoryBody({
  cat,
  comps,
  selections,
  qtySteps,
  qmultFor = () => 1,
  toggle,
  setQty,
}: {
  cat: Category;
  comps: Component[];
  selections: Selections;
  qtySteps?: number[];
  qmultFor?: (comp: Component) => number;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(false);
  // Size chosen on a row that is not selected yet, so the buttons work before
  // you commit to the item and the calories update as you compare.
  const [preview, setPreview] = useState<Record<string, string>>({});
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
  const matched = filter
    ? families.filter((f) =>
        f.head.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : families;
  // Long lists cut off with a "Show all" rather than becoming an inner scroll
  // box: a nested scroll region fights the page scroll on touch, and a styled
  // scrollbar does not exist there. Anything selected survives the cut.
  const collapsible = !filter && matched.length > SEARCH_THRESHOLD;
  const shown =
    collapsible && !expanded
      ? matched.filter(
          (f, i) =>
            i < SEARCH_THRESHOLD || f.members.some((m) => selections[m.id]),
        )
      : matched;
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
          const active =
            members.find((m) => selections[m.id]) ??
            members.find((m) => m.id === preview[head.id]) ??
            head;
          return (
            <ComponentRow
              key={head.id}
              comp={active}
              qty={selections[active.id]}
              single={single}
              qmult={qmultFor(active)}
              qtySteps={qtySteps}
              onToggle={() => toggle(active, single)}
              onQty={(q) => setQty(active.id, q)}
              variants={members.length > 1 ? members : undefined}
              onVariant={(next) => {
                if (next.id === active.id) return;
                setPreview((p) => ({ ...p, [head.id]: next.id }));
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
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 w-full rounded-lg py-2 text-sm font-medium text-accent-strong transition-colors hover:bg-surface-2"
        >
          {expanded ? "Show fewer" : `Show all ${matched.length}`}
        </button>
      )}
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
  portionNote: string | null = null,
): string {
  const items = picked
    .map((c) =>
      sel[c.id] === 1 ? fullName(c) : `${fmtQty(sel[c.id])} ${fullName(c)}`,
    )
    .join(", ");
  return [
    `${chain.name}${modeName ? ` — ${modeName}` : ""} (built on eatimate)`,
    items + (portionNote ? ` — ${portionNote}` : ""),
    ``,
    `Calories: ${show(totals.calories)}`,
    `Total Fat: ${show(totals.fat_g, 1)} g`,
    `Saturated Fat: ${show(totals.sat_fat_g, 1)} g`,
    `Trans Fat: ${show(totals.trans_fat_g, 1)} g`,
    `Cholesterol: ${show(totals.cholesterol_mg)} mg`,
    `Sodium: ${show(totals.sodium_mg)} mg`,
    `Total Carbohydrate: ${show(totals.carbs_g, 1)} g`,
    `Dietary Fiber: ${show(totals.fiber_g, 1)} g`,
    `Total Sugars: ${show(totals.sugars_g, 1)} g`,
    `Protein: ${show(totals.protein_g, 1)} g`,
    ``,
    url,
  ].join("\n");
}

/**
 * Save the panel as a PNG, drawn in the browser -- no request, so nothing about
 * a meal leaves the device.
 *
 * iOS Safari ignores <a download> for blob URLs, so there the image is opened
 * in a new tab to be long-pressed and saved. Web Share is tried first, since it
 * puts the file straight into Photos (and therefore into a tracker's scanner).
 */
function SaveImageButton({
  chain,
  subtitle,
  totals,
  selections,
  missing,
  estimated,
}: {
  chain: Chain;
  subtitle: string;
  totals: Totals;
  selections: Selections;
  missing?: ReadonlySet<string>;
  estimated?: ReadonlySet<string>;
}) {
  const [busy, setBusy] = useState(false);
  // Shown even with nothing selected, greyed out: the panel is on screen from
  // the start, so hiding its controls just makes the feature undiscoverable.
  const empty = chain.components.every((c) => !selections[c.id]);
  return (
    <button
      type="button"
      disabled={busy || empty}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await drawLabel(totals, subtitle, missing, estimated);
          if (!blob) return;
          const name = `${chain.slug}-nutrition.png`;
          const file = new File([blob], name, { type: "image/png" });
          const nav = navigator as Navigator & {
            canShare?: (d: { files: File[] }) => boolean;
          };
          if (nav.canShare?.({ files: [file] })) {
            await nav.share({ files: [file], title: "Nutrition Facts" });
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name;
          if ("download" in a) a.click();
          else window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch {
          // A cancelled share rejects; nothing to report.
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium shadow-sm transition-colors hover:border-accent hover:text-accent-strong disabled:opacity-50 disabled:hover:border-line disabled:hover:text-fg"
    >
      <IconDownload className="h-4 w-4" /> Save label as image
    </button>
  );
}

/**
 * Share the meal itself. The selections already live in the URL, but nobody
 * discovers that, and nobody selects a long URL out of a phone's address bar.
 * Native sheet where there is one, clipboard everywhere else.
 */
function ShareMealButton({
  chain,
  selections,
  portion = 1,
}: {
  chain: Chain;
  selections: Selections;
  portion?: number;
}) {
  const [state, setState] = useState<"idle" | "copied">("idle");
  const empty = chain.components.every((c) => !selections[c.id]);
  return (
    <button
      type="button"
      disabled={empty}
      onClick={async () => {
        const url = mealUrl(selections, portion);
        const title = `${chain.name} on eatimate`;
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch (e) {
            // Dismissing the sheet is a decision, not a failure: copying the
            // link and flashing "Link copied" would undo what was just asked.
            if ((e as Error)?.name === "AbortError") return;
            // Anything else (no handler, refused) falls through to the clipboard.
          }
        }
        if (await copyText(url)) {
          setState("copied");
          setTimeout(() => setState("idle"), 1500);
        }
      }}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium shadow-sm transition-colors hover:border-accent hover:text-accent-strong disabled:opacity-50 disabled:hover:border-line disabled:hover:text-fg"
    >
      {state === "copied" ? (
        <>
          <IconCheck className="h-4 w-4 text-accent-strong" /> Link copied
        </>
      ) : (
        <>
          <IconShare className="h-4 w-4" /> Share this meal
        </>
      )}
    </button>
  );
}

function CopyLabelButton({
  chain,
  modeName,
  selections,
  totals,
  portion = 1,
  portionMax = 0,
}: {
  chain: Chain;
  modeName: string | null;
  selections: Selections;
  totals: Totals;
  portion?: number;
  portionMax?: number;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [text, setText] = useState("");
  const picked = chain.components.filter((c) => selections[c.id]);
  const empty = picked.length === 0;
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={empty}
        onClick={async () => {
          const t = labelText(
            chain,
            modeName,
            picked,
            selections,
            totals,
            mealUrl(selections, portion),
            portionMax > 1 && chain.portion
              ? `${portion} of ${portionMax} ${chain.portion.unit}s`
              : null,
          );
          setText(t);
          if (await copyText(t)) {
            setState("copied");
            setTimeout(() => setState("idle"), 1500);
          } else {
            setState("manual");
          }
        }}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium shadow-sm transition-colors hover:border-accent hover:text-accent-strong disabled:opacity-50 disabled:hover:border-line disabled:hover:text-fg"
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
  chrome = "full",
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
    (c) => c.flow === "preset" && visibleByCategory.has(c.id),
  );
  const scratchCats = chain.categories.filter(
    (c) => (c.flow ?? "build") === "build" && visibleByCategory.has(c.id),
  );
  const hasPresets = presetCats.length > 0;
  const [mode, setMode] = useState<"menu" | "scratch" | null>(null);
  const buildCats = !hasPresets
    ? scratchCats
    : mode === "menu"
      ? presetCats
      : mode === "scratch"
        ? scratchCats
        : [];
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
  const extraCats =
    mode === "menu" ? [...scratchCats, ...plainExtras] : plainExtras;

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
    const q = new URLSearchParams(window.location.search);
    const p = Number(q.get("p"));
    if (Number.isInteger(p) && p > 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from URL after mount
      setPortion(p);
    }
    const m = q.get("m");
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
      // Stay put when the row carries a size selector: advancing would collapse
      // the step before the size has been chosen, so getting it wrong means
      // going back. Rows without a size still advance as before.
      if (idx >= 0 && !comp.variant_label) {
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
                      qtySteps={portionCats.has(cat.id) ? COVERAGE_STEPS : undefined}
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

        {featured.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
            <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Make it a meal
            </h2>
            <div className="space-y-3">
              {featured.map(({ cat, comps }) => (
                <div key={cat.id}>
                  <p className="px-1 pb-1 text-xs text-muted">{cat.name}</p>
                  <ul className="space-y-0.5">
                    {comps.map((head) => {
                      const members = [
                        head,
                        ...(visibleByCategory.get(cat.id) ?? []).filter(
                          (c) => c.variant_of === head.id,
                        ),
                      ];
                      const active =
                        members.find((m) => selections[m.id]) ?? head;
                      return (
                        <ComponentRow
                          key={head.id}
                          comp={active}
                          qty={selections[active.id]}
                          single={cat.select === "single"}
                          qmult={rowMult(active)}
                          onToggle={() => toggle(active, cat.select === "single")}
                          onQty={(q) => setQty(active.id, q)}
                          variants={members.length > 1 ? members : undefined}
                          onVariant={(next) => {
                            if (next.id === active.id) return;
                            const q = selections[active.id];
                            if (q) {
                              setQty(active.id, 0);
                              setQty(next.id, q);
                            }
                          }}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {extraCats.length > 0 && (
          <>
            <h2 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">
              {mode === "menu"
                ? "Add to it"
                : "Sides, drinks & other menu items"}
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
          <button
            type="button"
            onClick={() => setLabelOpen((v) => !v)}
            aria-expanded={labelOpen}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-accent px-4 text-on-accent shadow-lg shadow-accent/30"
          >
            <span className="text-lg font-bold tabular-nums">
              {show(totals.calories)} cal
            </span>
            <span className="text-xs tabular-nums opacity-90">
              {show(totals.protein_g, 1)}g protein ·{" "}
              {show(totals.carbs_g, 1)}g carbs · {show(totals.fat_g, 1)}g
              fat
            </span>
            <IconChevron
              className={`h-5 w-5 transition-transform ${labelOpen ? "rotate-90" : "-rotate-90"}`}
            />
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
