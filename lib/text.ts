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
