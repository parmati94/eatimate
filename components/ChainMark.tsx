import type { CSSProperties } from "react";
import ChainGlyph from "./ChainGlyph";
import type { Tint } from "@/lib/brand";

/**
 * A chain's glyph on its own tinted ground.
 *
 * `data-chain` hands this subtree the chain's colour through the accent role
 * (see globals.css), so the tile picks the right shade for the current theme
 * without any of the five call sites knowing how that works.
 */
export default function ChainMark({
  glyph,
  name,
  tint,
  className = "h-9 w-9 rounded-lg",
  iconClassName = "h-6 w-6",
}: {
  glyph?: string;
  name: string;
  tint: Tint;
  /** Size and corner of the tile itself. */
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      aria-hidden
      data-chain
      style={
        { "--chain-l": tint.light, "--chain-d": tint.dark } as CSSProperties
      }
      className={`flex shrink-0 items-center justify-center border border-accent/20 bg-accent-soft text-accent ${className}`}
    >
      {glyph ? (
        <ChainGlyph glyph={glyph} className={iconClassName} />
      ) : (
        <span className="num text-sm font-bold">{name[0]}</span>
      )}
    </span>
  );
}
