/**
 * A chain's name in the possessive.
 *
 * Four of the chains already end in a possessive or a plural s, so the naive
 * `${name}'s` produced "Domino's's published data" and "Five Guys's". Both
 * render on live pages today.
 */
export function possessive(name: string): string {
  // Already possessive: Domino's, Papa John's.
  if (/['’]s$/.test(name)) return name;
  // Plural: Five Guys', Buffalo Wild Wings'.
  if (/s$/.test(name)) return `${name}’`;
  return `${name}’s`;
}

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with",
]);
/** Vowel-less abbreviations that are still words, not initialisms. */
const HONORIFICS = new Set(["DR", "JR", "SR", "MR", "MRS", "ST"]);
/** Short words that read as initialisms despite carrying a vowel. */
const KEEP_CAPS = new Set(["EZ", "XL", "XXL", "PB", "PBJ"]);

/**
 * An all-caps name in sentence-readable case.
 *
 * Sonic prints its whole chart in capitals (561 of 572 rows) and Jimmy John's
 * prints its sandwiches that way. Capitals are a typesetting choice on the
 * chain's PDF, not a fact about the item, and in a list they cost about 15%
 * more width per row -- which on a phone is the difference between "ALL-
 * AMERICAN BACON SONI…" and a name you can read. Names with any lowercase in
 * them are returned untouched, so a chain that already cases its chart is
 * never second-guessed.
 *
 * Kept as printed: initialisms with no vowel (BBQ, BLT, RT 44, EZ, JR),
 * dotted initials (J.J.), anything with an ampersand inside a word (M&M'S),
 * and small words drop to lowercase except at the start.
 */
export function readableCase(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name
    .split(" ")
    .map((word, i) => {
      if (/^([A-Z]\.){2,}/.test(word) || word.includes("&")) return word;
      const letters = word.replace(/[^A-Z]/g, "");
      const initialism =
        KEEP_CAPS.has(letters) ||
        (letters.length > 0 &&
          letters.length <= 3 &&
          !/[AEIOUY]/.test(letters) &&
          !HONORIFICS.has(letters));
      if (initialism) return word;
      const lowered = word.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lowered)) return lowered;
      // Each hyphenated part takes its own capital: ALL-AMERICAN, COCA-COLA.
      return lowered.replace(/(^|[-(/])([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
    })
    .join(" ");
}

/**
 * A row's name on its own chain's page.
 *
 * Strips a leading registered-mark prefix of the chain's own name --
 * "Chick-fil-A® Nuggets" is "Nuggets" on the Chick-fil-A page, and 31 of its
 * rows carry the prefix, which is what pushed them past the ellipsis. Only the
 * ®-suffixed form is stripped: "Chipotle Honey Chicken" names a pepper,
 * "Subway Club®" is the sandwich, and "Five Guys Style Fries" is a style, so
 * a bare chain-name prefix is left alone. A name that is nothing but the
 * prefix ("Whataburger®") is kept whole.
 */
export function displayName(name: string, chainName: string): string {
  const cased = readableCase(name);
  const prefix = new RegExp(`^${chainName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}®\\s+`, "i");
  const stripped = cased.replace(prefix, "");
  return stripped.length > 0 ? stripped : cased;
}
