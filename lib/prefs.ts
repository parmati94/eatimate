/**
 * What the site remembers on this device.
 *
 * Everything here is a convenience, never a record: the last order at a chain
 * (already a share URL, so nothing irreplaceable) and which macro the totals
 * bar shows beside calories. localStorage can be missing, full or blocked, so
 * every read and write is wrapped and a failure means "nothing remembered".
 * Client-only: nothing in here may run during SSR.
 */
import type { NutrientField } from "./schema";

const LAST_PREFIX = "eatimate.last.";
const BAR_MACRO_KEY = "eatimate.barMacro";

export interface LastOrder {
  /** The ?m= encoding of the meal. */
  m: string;
  /** Portion eaten (slices of a pizza); 1 when not applicable. */
  p: number;
  /** When it was last edited, epoch ms. */
  at: number;
}

export function readLastOrder(slug: string): LastOrder | null {
  try {
    const raw = localStorage.getItem(LAST_PREFIX + slug);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastOrder>;
    if (typeof v.m !== "string" || !v.m) return null;
    return { m: v.m, p: Number.isInteger(v.p) && v.p! > 1 ? v.p! : 1, at: v.at ?? 0 };
  } catch {
    return null;
  }
}

export function writeLastOrder(slug: string, m: string, p: number): void {
  try {
    localStorage.setItem(LAST_PREFIX + slug, JSON.stringify({ m, p, at: Date.now() }));
  } catch {
    /* nothing remembered */
  }
}

export function clearLastOrder(slug: string): void {
  try {
    localStorage.removeItem(LAST_PREFIX + slug);
  } catch {
    /* already gone */
  }
}

/** The macros the bar can feature. Calories is always the headline. */
export const BAR_MACROS = [
  { field: "protein_g", label: "protein", unit: "g" },
  { field: "carbs_g", label: "carbs", unit: "g" },
  { field: "fat_g", label: "fat", unit: "g" },
  { field: "sodium_mg", label: "sodium", unit: "mg" },
] as const satisfies readonly { field: NutrientField; label: string; unit: string }[];

export type BarMacro = (typeof BAR_MACROS)[number]["field"];
export const DEFAULT_BAR_MACRO: BarMacro = "protein_g";

export function readBarMacro(): BarMacro {
  try {
    const v = localStorage.getItem(BAR_MACRO_KEY);
    return BAR_MACROS.some((b) => b.field === v) ? (v as BarMacro) : DEFAULT_BAR_MACRO;
  } catch {
    return DEFAULT_BAR_MACRO;
  }
}

export function writeBarMacro(field: BarMacro): void {
  try {
    if (field === DEFAULT_BAR_MACRO) localStorage.removeItem(BAR_MACRO_KEY);
    else localStorage.setItem(BAR_MACRO_KEY, field);
  } catch {
    /* nothing remembered */
  }
}
