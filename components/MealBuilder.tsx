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
  return (
    <span
      className="inline-flex items-center overflow-hidden rounded-full border border-emerald-300 bg-white text-sm dark:border-emerald-800 dark:bg-neutral-900"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="less"
        disabled={i <= 0}
        onClick={() => onChange(QTY_STEPS[i - 1])}
        className="px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 dark:text-emerald-400 dark:hover:bg-neutral-800"
      >
        −
      </button>
      <span className="min-w-8 text-center text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
        {fmtQty(qty)}
      </span>
      <button
        type="button"
        aria-label="more"
        disabled={i >= QTY_STEPS.length - 1}
        onClick={() => onChange(QTY_STEPS[i + 1])}
        className="px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 dark:text-emerald-400 dark:hover:bg-neutral-800"
      >
        +
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
        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
          selected
            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40"
            : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
        }`}
      >
        <span
          aria-hidden
          className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] font-bold text-white ${
            single ? "rounded-full" : "rounded"
          } ${
            selected
              ? "border-emerald-600 bg-emerald-600"
              : "border-neutral-300 dark:border-neutral-600"
          }`}
        >
          {selected && "✓"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {comp.name}
          </span>
          <span className="block text-xs text-neutral-500">
            {comp.serving_desc}
          </span>
        </span>
        {selected ? (
          <QtyStepper qty={qty} onChange={onQty} />
        ) : (
          <span className="text-xs tabular-nums text-neutral-400">
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
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Search ${cat.name.toLowerCase()}…`}
          className="mb-1 w-full rounded-lg border border-neutral-200 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-neutral-700"
        />
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
          <li className="px-3 py-2 text-sm text-neutral-500">No matches.</li>
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

function labelText(chain: Chain, picked: Component[], sel: Selections, totals: Totals, url: string): string {
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
      className="w-full rounded-lg border border-emerald-600 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:bg-neutral-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
    >
      {copied ? "Copied ✓" : "Copy label as text"}
    </button>
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

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[1fr_300px] lg:pb-0">
      <div className="space-y-4">
        <div className="space-y-2">
          {buildCats.map((cat, idx) => {
            const comps = byCategory.get(cat.id)!;
            const open = openCat === cat.id;
            const summary = picksSummary(comps, selections);
            return (
              <section
                key={cat.id}
                className={`rounded-xl border bg-white shadow-sm transition-colors dark:bg-neutral-900 ${
                  open
                    ? "border-emerald-400 dark:border-emerald-700"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenCat(open ? null : cat.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      summary ? "bg-emerald-600" : "bg-neutral-400 dark:bg-neutral-600"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-semibold">{cat.name}</span>
                      {!summary && (
                        <span className="text-xs text-neutral-500">
                          {cat.select === "single" ? "pick one" : "pick any"}
                        </span>
                      )}
                    </span>
                    {summary && !open && (
                      <span className="block truncate text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {summary}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-xs text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                </button>
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
            <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Sides, drinks &amp; other menu items
            </h2>
            <div className="space-y-2">
              {extraCats.map((cat) => {
                const comps = byCategory.get(cat.id)!;
                const summary = picksSummary(comps, selections);
                return (
                  <details
                    key={cat.id}
                    className="group rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3">
                      <span className="text-xs text-neutral-400 transition-transform group-open:rotate-90">
                        ▶
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="font-semibold">{cat.name}</span>
                          <span className="text-xs font-normal text-neutral-500">
                            {comps.length}
                          </span>
                        </span>
                        {summary && (
                          <span className="block truncate text-xs font-medium text-emerald-700 group-open:hidden dark:text-emerald-400">
                            {summary}
                          </span>
                        )}
                      </span>
                    </summary>
                    <CategoryBody
                      cat={cat}
                      comps={comps}
                      selections={selections}
                      toggle={toggle}
                      setQty={setQty}
                    />
                  </details>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Desktop: sticky label column */}
      <aside className="hidden lg:sticky lg:top-4 lg:block lg:space-y-2 lg:self-start">
        <NutritionLabel totals={totals} />
        <CopyLabelButton chain={chain} selections={selections} totals={totals} />
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
          </span>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => setSelections({})}
              className="underline"
            >
              clear all
            </button>
          )}
        </div>
      </aside>

      {/* Mobile: sticky totals bar + slide-up label */}
      <div className="fixed inset-x-0 bottom-0 z-10 lg:hidden">
        {labelOpen && (
          <div className="mx-auto max-w-md space-y-2 px-4 pb-2">
            <NutritionLabel totals={totals} />
            <CopyLabelButton
              chain={chain}
              selections={selections}
              totals={totals}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setLabelOpen((v) => !v)}
          className="flex w-full items-center justify-between border-t border-emerald-700 bg-emerald-600 px-5 py-3 text-white"
        >
          <span className="text-lg font-bold tabular-nums">
            {roundCalories(totals.calories)} cal
          </span>
          <span className="text-sm tabular-nums opacity-90">
            P {roundGrams(totals.protein_g)}g · C {roundGrams(totals.carbs_g)}g
            · F {roundGrams(totals.fat_g)}g
          </span>
          <span className="text-sm font-medium underline">
            {labelOpen ? "hide" : "label"}
          </span>
        </button>
      </div>
    </div>
  );
}
