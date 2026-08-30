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

const QTY_STEPS = [0.5, 1, 2, 3];
const SEARCH_THRESHOLD = 14;

type Selections = Record<string, number>; // component id -> qty multiplier

function emptyTotals(): Totals {
  return Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, 0])) as Totals;
}

function fmtQty(q: number): string {
  return q === 0.5 ? "½×" : `${q}×`;
}

// ---- URL meal state: /chain?m=id,id:0.5,id:2 ------------------------------

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
  onToggle,
  onQty,
}: {
  comp: Component;
  qty: number | undefined;
  single: boolean;
  onToggle: () => void;
  onQty: (q: number) => void;
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
          <span className="block text-xs text-muted">{comp.serving_desc}</span>
        </span>
        {selected ? (
          <QtyStepper qty={qty} onChange={onQty} />
        ) : (
          <span className="text-xs tabular-nums text-muted">
            {comp.calories} cal
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
  toggle,
  setQty,
}: {
  cat: Category;
  comps: Component[];
  selections: Selections;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const single = cat.select === "single";
  const shown = filter
    ? comps.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
    : comps;
  return (
    <div className="px-2 pb-2">
      {comps.length > SEARCH_THRESHOLD && (
        <label className="relative mb-1 block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${cat.name.toLowerCase()}…`}
            className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
        </label>
      )}
      <ul className="space-y-0.5">
        {shown.map((comp) => (
          <ComponentRow
            key={comp.id}
            comp={comp}
            qty={selections[comp.id]}
            single={single}
            onToggle={() => toggle(comp, single)}
            onQty={(q) => setQty(comp.id, q)}
          />
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted">No matches.</li>
        )}
      </ul>
    </div>
  );
}

function picksSummary(comps: Component[], selections: Selections): string {
  const picked = comps.filter((c) => selections[c.id]);
  if (picked.length === 0) return "";
  return picked
    .map((c) => {
      const q = selections[c.id];
      return q === 1 ? c.name : `${fmtQty(q)} ${c.name}`;
    })
    .join("  +  ");
}

function labelText(
  chain: Chain,
  picked: Component[],
  sel: Selections,
  totals: Totals,
  url: string,
): string {
  const items = picked
    .map((c) => (sel[c.id] === 1 ? c.name : `${fmtQty(sel[c.id])} ${c.name}`))
    .join(", ");
  return [
    `${chain.name} (built on mealmath)`,
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

function CopyLabelButton({
  chain,
  selections,
  totals,
}: {
  chain: Chain;
  selections: Selections;
  totals: Totals;
}) {
  const [copied, setCopied] = useState(false);
  const picked = chain.components.filter((c) => selections[c.id]);
  if (picked.length === 0) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(
          labelText(chain, picked, selections, totals, window.location.href),
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium shadow-sm transition-colors hover:border-accent hover:text-accent-strong"
    >
      {copied ? (
        <>
          <IconCheck className="h-4 w-4 text-accent-strong" /> Copied
        </>
      ) : (
        <>
          <IconCopy className="h-4 w-4" /> Copy label as text
        </>
      )}
    </button>
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

  const buildCats = chain.categories.filter(
    (c) => (c.flow ?? "build") === "build" && byCategory.has(c.id),
  );
  const extraCats = chain.categories.filter(
    (c) => c.flow === "extras" && byCategory.has(c.id),
  );

  const [openCat, setOpenCat] = useState<string | null>(
    buildCats[0]?.id ?? null,
  );

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
  useEffect(() => {
    if (!hydrated.current) return;
    const url = new URL(window.location.href);
    const encoded = encodeMeal(selections);
    if (encoded) url.searchParams.set("m", encoded);
    else url.searchParams.delete("m");
    window.history.replaceState(null, "", url);
  }, [selections]);

  const totals = useMemo(() => {
    const t = emptyTotals();
    for (const c of chain.components) {
      const qty = selections[c.id];
      if (!qty) continue;
      for (const f of NUTRIENT_FIELDS) t[f] += c[f] * qty;
    }
    return t;
  }, [chain, selections]);

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
    // Single-select pick in the build flow: advance the accordion.
    if (single && !selections[comp.id]) {
      const idx = buildCats.findIndex((c) => c.id === comp.category);
      if (idx >= 0) setOpenCat(buildCats[idx + 1]?.id ?? null);
    }
  }

  const setQty = (id: string, q: number) =>
    setSelections((prev) => ({ ...prev, [id]: q }));

  const clearAll = () => setSelections({});

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[1fr_300px] lg:pb-0">
      <div className="space-y-5">
        <div className="space-y-2">
          {buildCats.map((cat, idx) => {
            const comps = byCategory.get(cat.id)!;
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
                  <CategoryBody
                    cat={cat}
                    comps={comps}
                    selections={selections}
                    toggle={toggle}
                    setQty={setQty}
                  />
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
                  comps={byCategory.get(cat.id)!}
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
        <CopyLabelButton chain={chain} selections={selections} totals={totals} />
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
