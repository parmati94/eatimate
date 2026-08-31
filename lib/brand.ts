// Deterministic tile hue per chain (no trademarked logos/colors); rendered
// as a tinted ground with the hue carried by the food glyph. Shared by the
// homepage tiles and the generated share cards.
const PALETTE = [
  "#0d9488",
  "#0284c7",
  "#d97706",
  "#e11d48",
  "#7c3aed",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
];

export function tileHue(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return PALETTE[h % PALETTE.length];
}
