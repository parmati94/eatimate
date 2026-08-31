import type { CSSProperties } from "react";
import ChainGlyph from "./ChainGlyph";
import type { Tint } from "@/lib/brand";

/**
 * A chain's glyph on its own tinted ground.
 *
 * `data-chain` hands this subtree the chain's colour through the accent role
 * (see globals.css), so the tile picks the right shade for the current theme
 * without any of the call sites knowing how that works.
 *
 * `emphasis` exists because the mark has two jobs. Usually it identifies one
 * chain, and the soft tinted ground is the right, quiet treatment. On a
 * comparison it has to tell two chains APART, and soft fails at that: the
 * ground is an 11% mix, which compresses the distance between two chains of
 * the same cuisine -- 0.10 in OKLab, perfectly visible at full strength -- down
 * to about 0.011, well under what anyone can see. Domino's and Papa John's
 * arrived as the same pale pink. Solid paints the accent undiluted, so the
 * difference survives.
 */
export default function ChainMark({
  glyph,
  name,
  tint,
  emphasis = "soft",
  className = "h-9 w-9 rounded-lg",
  iconClassName = "h-6 w-6",
}: {
  glyph?: string;
  name: string;
  tint: Tint;
  /** "soft" identifies one chain; "solid" separates two. */
  emphasis?: "soft" | "solid";
  /** Size and corner of the tile itself. */
  className?: string;
  iconClassName?: string;
}) {
  const solid = emphasis === "solid";
  return (
    <span
      aria-hidden
      data-chain
      style={
        {
          "--chain-l": tint.light,
          "--chain-d": tint.dark,
          // Cut-outs inside the glyph read against whatever it sits on.
          ...(solid ? { "--glyph-detail": "var(--accent)" } : {}),
        } as CSSProperties
      }
      className={`flex shrink-0 items-center justify-center border ${
        solid
          ? "border-accent bg-accent text-on-accent"
          : "border-accent/20 bg-accent-soft text-accent"
      } ${className}`}
    >
      {glyph ? (
        <ChainGlyph glyph={glyph} className={iconClassName} />
      ) : (
        <span className="num text-sm font-bold">{name[0]}</span>
      )}
    </span>
  );
}
