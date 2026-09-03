"use client";

/** Everything that draws a category: its header, its rows, and the size chips
 *  and add-ons that hang off a row. */
import { CSSProperties, ReactNode, useMemo, useState } from "react";
import type { Category, Component } from "@/lib/schema";
import { QTY_STEPS, Selections } from "@/lib/meal";
import { IconCheck, IconChevron, IconMinus, IconPlus, IconSearch } from "../icons";
import { familiesOf } from "@/lib/search";
import { choiceCount, fmtQty, picksSummary } from "./format";

export const SEARCH_THRESHOLD = 14;

// ---------------------------------------------------------------------------

export function QtyStepper({
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
      className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
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
      <span className="num min-w-8 text-center text-xs font-semibold">
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

export function ComponentRow({
  comp,
  qty,
  single,
  qmult = 1,
  onToggle,
  onQty,
  variants,
  onVariant,
  qtySteps,
  addons,
  rangeHint,
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
  /** Extras that ride along with this row, rendered beneath it inside the same
   *  list item so they read as belonging to it rather than as siblings. */
  addons?: ReactNode;
  /** What the sizes span, for a row whose chips are hidden until it is picked. */
  rangeHint?: string;
}) {
  const selected = !!qty;
  const hasVariants = !!variants && variants.length > 1;
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
        // Wraps so the size chips can take a line of their own. They used to
        // sit inside the name column, which meant selecting the row summoned
        // the quantity stepper, narrowed that column and bumped the last chip
        // ("16\" Extra Large") onto a second line -- the row reflowed as a
        // side effect of being picked.
        className={`flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 rounded-xl px-3 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
          hasVariants ? "py-2" : ""
        } ${selected ? "bg-accent-soft" : "hover:bg-surface-2"}`}
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
            {/* The chain's own serving text is left exactly as written; the
                span is appended, never substituted into it. "6 boneless wings"
                is BWW's sentence, "6-30" is ours. */}
            {rangeHint && <span className="text-muted/80"> · {rangeHint}</span>}
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
        </span>
        {selected && <QtyStepper qty={qty} onChange={onQty} steps={qtySteps} />}
        {/* Always shown: comparing sizes is the whole point of the size
            buttons, and it is the selected row you are comparing. Stays last
            so the calorie column lines up whether or not a row is selected. */}
        <span className="num w-12 shrink-0 text-right text-xs text-muted">
          {Math.round(comp.calories * qmult)} cal
        </span>
        {hasVariants && (
          // A full-width line of its own, indented to the name above it: the
          // sizes belong to this row, so they read as one choice with it, but
          // they must not share width with the quantity stepper. pl-8 clears
          // the radio (w-5) plus the row's gap-x-3. Clicks must not bubble to
          // the row's own toggle handler.
          <span className="mt-1.5 basis-full pl-8" onClick={(e) => e.stopPropagation()}>
            {/*
              One segmented control, not a row of loose pills.

              The grid is what makes it survive a wide set: `auto-fit` wraps to
              as many lines as it needs while a single outer border and radius
              keep it reading as ONE object, so there is no per-line border
              maths and nothing can run off the side. Chick-fil-A's twelve-way
              rows overflowed a phone as a single line and simply put their
              tail out of reach. Long labels truncate rather than push.

              The hairlines are the 1px grid gap showing the container's
              background through, which is why the cells carry bg-surface.

              36px rather than the 44px these were: the cells are contiguous
              and full-width, so the whole strip is tappable with no dead space
              between targets -- the thing 44px was protecting against when
              they were 23px pills with gaps.
            */}
            <span
              // No outer border on purpose. With one, the strip carries a
              // border AND a background and reads as a card inside a card --
              // three of them stacked compete with the rows they belong to.
              // The hairlines are still the 1px gaps showing bg-line through,
              // so the control keeps its structure without announcing itself
              // as a container.
              className="flex flex-wrap gap-px overflow-hidden rounded-lg bg-line"
              // Column width follows the longest label rather than sitting at
              // one figure for every chain: a fixed minimum wide enough for
              // Domino's "16\" Extra Large" pushed BWW's 6 / 10 / 15 / 20 / 30
              // onto two lines for no reason.
              //
              // In px, deliberately. `ch` resolves against the grid's inherited
              // 15px body font rather than the 12px chip font, which made one
              // long label demand a column wider than the phone and gave every
              // chip a line of its own. Floored at 56 so a two-character label
              // is still a comfortable target, capped at 110 so a long label
              // truncates -- which is what `truncate` is there for -- instead
              // of collapsing the strip to a single column.
              style={
                {
                  "--chip": `${Math.max(
                    48,
                    Math.min(
                      92,
                      Math.max(...variants.map((v) => (v.variant_label ?? "").length)) * 7 + 20,
                    ),
                  )}px`,
                } as CSSProperties
              }
            >
              {variants.map((v) => {
                const active = v.id === comp.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onVariant?.(v)}
                    className={`num min-h-9 flex-1 basis-[var(--chip)] truncate px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                      active
                        ? "bg-accent text-on-accent"
                        : "bg-surface text-muted hover:text-accent-strong"
                    }`}
                  >
                    {v.variant_label}
                  </button>
                );
              })}
            </span>
          </span>
        )}
      </div>
      {addons}
    </li>
  );
}

/**
 * What a hidden size family spans, said in its own labels.
 *
 * Only the labels are read -- never the chain's serving text. "6 boneless
 * wings" is BWW's sentence about the six; turning it into "6-30 boneless
 * wings" would put words in their mouth. So the span is appended as its own
 * clause instead, built from the variant labels we assigned.
 *
 * A numeric family gets a real range with whatever unit its largest label
 * carries. Anything else gets a plain count, because an unordered set has no
 * range to state -- Chick-fil-A's twelve are proteins and a hash-brown toggle,
 * and "Nuggets-No Meat" would be nonsense.
 */
function rangeOf(members: Component[]): string | undefined {
  if (members.length < 2) return undefined;
  const parts = members.map((m) => /^([\d.]+)\s*(.*)$/.exec(m.variant_label ?? ""));
  if (parts.every(Boolean)) {
    const nums = parts.map((p) => Number(p![1]));
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    if (lo !== hi) {
      const unit = parts[nums.indexOf(hi)]![2].trim();
      // A space before a word, none before a mark: 20-30 fl oz, but 5.5-12.5"
      // rather than 5.5-12.5 ".
      const sep = /^[a-z]/i.test(unit) ? " " : "";
      return `${lo}\u2013${hi}${unit ? sep + unit : ""}`;
    }
  }
  return `${members.length} options`;
}

/**
 * One size family: the row, its size chips and anything that rides along.
 *
 * Owns the "size picked but item not selected yet" state, which is why it is a
 * component rather than inline JSX. That state used to live in CategoryBody,
 * so the SAME family rendered from the "Make it a meal" block -- which builds
 * its rows directly -- had chips that did nothing until the item was selected.
 * Two call sites, two behaviours, from one concept. Now there is one.
 */
export function FamilyRow({
  head,
  members,
  selections,
  single,
  qtySteps,
  qmultFor,
  toggle,
  setQty,
  addonsOf,
  chipsOnPick = false,
}: {
  head: Component;
  /** The family, head first. Length 1 for a row with no sizes. */
  members: Component[];
  selections: Selections;
  single: boolean;
  qtySteps?: number[];
  qmultFor: (comp: Component) => number;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
  addonsOf?: Map<string, Component[]>;
  /** Hold the size chips back until the row is picked.
   *
   *  For a list where the choice is WHICH ITEM, chips on every row are the
   *  whole cost of the list: Chick-fil-A's fourteen shown menu items ran
   *  3,219px against Burger King's 851px for the same fourteen, and 2,987px of
   *  that was chip rows. The size is a second question and can wait for it.
   *  Left off where the size IS the question -- drinks in the extras, the meal
   *  shelf -- because comparing sizes before committing is the point there. */
  chipsOnPick?: boolean;
}) {
  // A size chosen before the row is selected, so the chips work while you are
  // still comparing and the calorie figure moves with them.
  const [preview, setPreview] = useState<string | null>(null);
  // The row shows whichever size is selected, else the previewed one, else the
  // default size.
  const active =
    members.find((m) => selections[m.id]) ??
    members.find((m) => m.id === preview) ??
    head;
  // Only once the parent is picked -- an add-on reads as "and on that,
  // also...", which is nonsense before there is a that. Kept open while an
  // add-on is still selected so nothing can be checked and invisible at once.
  const addons = addonsOf?.get(active.id) ?? [];
  const showAddons =
    addons.length > 0 &&
    (!!selections[active.id] || addons.some((a) => selections[a.id]));
  return (
    <ComponentRow
      comp={active}
      qty={selections[active.id]}
      single={single}
      qmult={qmultFor(active)}
      qtySteps={qtySteps}
      onToggle={() => toggle(active, single)}
      onQty={(q) => setQty(active.id, q)}
      variants={
        members.length > 1 && (!chipsOnPick || !!selections[active.id])
          ? members
          : undefined
      }
      rangeHint={
        // Only while they are hidden. Once the chips are on screen they say
        // this better than a sentence can.
        chipsOnPick && !selections[active.id] ? rangeOf(members) : undefined
      }
      addons={
        showAddons ? (
          // Indented under a rule that starts at the parent's radio, so the
          // nesting is read from the same left edge the choice was made on.
          // Deliberately NOT chips: the size selector picks WHICH of one
          // thing, these add a second thing, so they stay checkboxes and keep
          // their own calorie column.
          <div className="ml-3 border-l-2 border-accent/40 pb-1 pl-2">
            <p className="px-3 pb-0.5 pt-1 text-[11px] font-medium text-muted">
              Add to your {active.name.toLowerCase()}
            </p>
            <ul className="space-y-0.5">
              {addons.map((a) => (
                <ComponentRow
                  key={a.id}
                  comp={a}
                  qty={selections[a.id]}
                  single={false}
                  qmult={qmultFor(a)}
                  qtySteps={qtySteps}
                  onToggle={() => toggle(a, false)}
                  onQty={(q) => setQty(a.id, q)}
                />
              ))}
            </ul>
          </div>
        ) : undefined
      }
      onVariant={(next) => {
        if (next.id === active.id) return;
        setPreview(next.id);
        const qty = selections[active.id];
        // Switching size moves the selection rather than adding a second row,
        // and carries the quantity across.
        if (qty) {
          setQty(active.id, 0);
          setQty(next.id, qty);
        }
      }}
    />
  );
}

export function SectionHeader({
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
  // The numeral stays put once the step is done. Replacing it with a tick lost
  // the one thing the number was carrying -- where you are in the line -- at
  // exactly the moment you want to know how much of the order is left.
  const badge =
    index !== undefined ? (
      <span
        className={`num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          done
            ? "bg-accent text-on-accent"
            : open
              ? "bg-fg text-bg"
              : "bg-surface-2 text-muted ring-1 ring-line"
        }`}
      >
        {index}
      </span>
    ) : null;
  const inner = (
    <>
      {badge}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-semibold">{name}</span>
          <span className="num text-xs text-muted">{count}</span>
        </span>
        {summary && !open && (
          <span className="flex items-center gap-1 text-xs font-medium text-accent-strong">
            <IconCheck className="h-3 w-3 shrink-0" />
            <span className="truncate">{summary}</span>
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

/**
 * One category as a card: header, optional note, body.
 *
 * Shared by the numbered build steps and by the "Add to it" group beneath
 * them. Those differ only in whether the header carries a number and whether a
 * rule joins it to the card above -- everything else was duplicated markup, and
 * duplicated markup is how the two "Add to it" headings happened.
 */
export function StepSection({
  cat,
  comps,
  index,
  connect,
  open,
  onToggle,
  selections,
  qtySteps,
  qmultFor,
  toggle,
  setQty,
}: {
  cat: Category;
  comps: Component[];
  /** Omitted for a card that is not a step you owe. */
  index?: number;
  connect: boolean;
  open: boolean;
  onToggle: () => void;
  selections: Selections;
  qtySteps?: number[];
  qmultFor: (comp: Component) => number;
  toggle: (comp: Component, single: boolean) => void;
  setQty: (id: string, q: number) => void;
}) {
  return (
    <section
      className={`relative rounded-2xl border bg-surface transition-all ${
        open
          ? "border-accent/60 shadow-md ring-1 ring-accent/15"
          : "border-line shadow-sm"
      } ${
        connect
          ? "before:absolute before:-top-2 before:left-[29px] before:h-2 before:w-0.5 before:bg-line before:content-['']"
          : ""
      }`}
    >
      <SectionHeader
        index={index}
        name={cat.name}
        count={choiceCount(comps)}
        summary={picksSummary(comps, selections)}
        open={open}
        onClick={onToggle}
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
            qtySteps={qtySteps}
            qmultFor={qmultFor}
            toggle={toggle}
            setQty={setQty}
          />
        </>
      )}
    </section>
  );
}

export function CategoryBody({
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
  const single = cat.select === "single";
  // Extras belonging to one specific row (Domino's garlic oil, which exists
  // only on Hand Tossed). Keyed by the exact component they attach to, not by
  // its family: the parent is already size-resolved, so garlic oil on a medium
  // is a different row from garlic oil on a large.
  const addonsOf = useMemo(() => {
    const m = new Map<string, Component[]>();
    for (const c of comps) {
      if (!c.addon_of) continue;
      m.set(c.addon_of, [...(m.get(c.addon_of) ?? []), c]);
    }
    return m;
  }, [comps]);
  // Collapse size families ("Small/Medium/Large Fries") into one row carrying a
  // size selector. Shared with the whole-chart search, which has to collapse
  // them the same way or "Coca-Cola" comes back five times.
  const families = useMemo(() => familiesOf(comps), [comps]);
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
        {shown.map(({ head, members }) => (
          <FamilyRow
            key={head.id}
            head={head}
            members={members}
            selections={selections}
            single={single}
            qtySteps={qtySteps}
            qmultFor={qmultFor}
            toggle={toggle}
            setQty={setQty}
            addonsOf={addonsOf}
            chipsOnPick={!(cat.size_leads ?? (cat.flow ?? "build") === "extras")}
          />
        ))}
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

export function ExtrasSection({
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
      className="rounded-2xl border border-line/70 bg-surface/60"
    >
      <SectionHeader
        name={cat.name}
        count={choiceCount(comps)}
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
