// Chain colour (no trademarked logos or brand colours): the hue says what kind
// of food the chain sells, and chains selling the same thing are separated by
// lightness rather than by hue.
//
// This replaced a hash of the slug. A hash guaranteed adjacent tiles differed,
// but the colour carried no information at all -- Chipotle came out purple.
// Keying the hue to the glyph makes the homepage grid scannable by cuisine;
// keying the shade to the chain keeps Chipotle and Qdoba apart inside it.

/**
 * Base colour per food glyph, as OKLCH [lightness, chroma, hue].
 *
 * Lightness and chroma are tuned per glyph rather than shared: a single L
 * across the wheel turns every warm hue between 50° and 110° into a brown,
 * because orange and yellow only read as themselves at a higher lightness than
 * red or blue does.
 *
 * Deliberately clear of the brand teal (~180°), so a chain's colour can never
 * be mistaken for "this is your total".
 */
const GLYPH_BASE: Record<string, [number, number, number]> = {
  pizza: [0.55, 0.17, 28], // tomato red
  wing: [0.62, 0.14, 58], // buffalo orange
  burrito: [0.56, 0.13, 50], // rust
  taco: [0.63, 0.12, 80], // gold
  pita: [0.6, 0.11, 118], // olive
  salad: [0.62, 0.16, 138], // fresh green
  grainbowl: [0.5, 0.11, 158], // deep green
  sub: [0.55, 0.14, 250], // blue
  burger: [0.53, 0.16, 300], // violet
};
/** A glyph with no colour of its own. Distinct from every entry above. */
const FALLBACK_BASE: [number, number, number] = [0.55, 0.05, 250];

/**
 * Shade steps within one hue, applied in slug order.
 *
 * Light mode only ever goes *darker* than the base, and dark mode only ever
 * goes lighter: stepping the other way pushed the warm hues under 3:1 against
 * their own ground, and these colours carry checkmarks and glyphs.
 *
 * Three steps covers today's roster (no food type is sold by more than three
 * chains here) and wraps rather than running out.
 */
const SHADE_LIGHT: [number, number][] = [
  [0, 1],
  [-0.1, 0.85],
  [-0.19, 0.92],
];
const SHADE_DARK: [number, number][] = [
  [0.18, 0.92],
  [0.27, 0.72],
  [0.1, 0.98],
];

export type Tint = { light: string; dark: string };

/**
 * OKLCH to an sRGB hex string.
 *
 * The shades are authored in OKLCH because it is the only space where stepping
 * lightness within a hue keeps the steps looking even. They are *emitted* as
 * hex because two consumers cannot read `oklch()`: the OG card renderer
 * (Satori) and the canvas that draws the label PNG.
 *
 * Out-of-gamut values are clamped per channel, which is fine at the chroma used
 * here -- every shade in the tables above is inside sRGB.
 */
function oklchToHex(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const hex = lin
    .map((c) => {
      const enc = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      const v = Math.round(Math.min(1, Math.max(0, enc)) * 255);
      return v.toString(16).padStart(2, "0");
    })
    .join("");
  return `#${hex}`;
}

/**
 * The chain's colour in both themes.
 *
 * `peers` is every slug sharing this glyph, in a stable order; the chain's
 * position in it picks the shade. Callers that do not have the full list get
 * the first shade, which is the right answer for a glyph used once.
 */
export function tileTint(
  glyph: string | undefined,
  slug: string,
  peers: string[] = [],
): Tint {
  const [L, C, H] = (glyph ? GLYPH_BASE[glyph] : undefined) ?? FALLBACK_BASE;
  const i = Math.max(0, peers.indexOf(slug)) % SHADE_LIGHT.length;
  const [dL, sC] = SHADE_LIGHT[i];
  const [dLd, sCd] = SHADE_DARK[i];
  return {
    light: oklchToHex(L + dL, C * sC, H),
    dark: oklchToHex(L + dLd, C * sCd, H),
  };
}

/** Groups slugs by glyph so `tileTint` can be given its peers. Sorted, so a
 *  chain keeps its shade as the roster grows -- adding a chain late in the
 *  alphabet cannot recolour the ones before it. */
export function tintPeers(
  chains: { slug: string; glyph?: string }[],
): Map<string, string[]> {
  const byGlyph = new Map<string, string[]>();
  for (const c of chains) {
    const key = c.glyph ?? "";
    byGlyph.set(key, [...(byGlyph.get(key) ?? []), c.slug]);
  }
  for (const [k, v] of byGlyph) byGlyph.set(k, v.sort());
  return byGlyph;
}

/**
 * One colour for a chain in a context with no theme to resolve against -- the
 * generated share cards, which are always drawn on white. Light shade only.
 */
export function tileHue(
  glyph: string | undefined,
  slug: string,
  peers: string[] = [],
): string {
  return tileTint(glyph, slug, peers).light;
}
