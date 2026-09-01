"use client";

/** Taking the built meal somewhere else: a link, a PNG of the label, or text
 *  for a tracker. */
import { useState } from "react";
import type { Chain, Component, Totals } from "@/lib/schema";
import { Selections } from "@/lib/meal";
import { show } from "@/lib/rounding";
import { copyText } from "@/lib/clipboard";
import { drawLabel } from "@/lib/labelImage";
import { IconCheck, IconCopy, IconDownload, IconShare } from "../icons";
import { fmtQty, fullName, mealUrl } from "./format";

export function labelText(
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
export function SaveImageButton({
  chain,
  subtitle,
  totals,
  selections,
  missing,
  estimated
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
export function ShareMealButton({
  chain,
  selections,
  portion = 1
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

export function CopyLabelButton({
  chain,
  modeName,
  selections,
  totals,
  portion = 1,
  portionMax = 0
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
