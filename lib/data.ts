import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { Chain, ChainSchema } from "./schema";
import { Tint, tileTint, tintPeers } from "./brand";

// Resolved at request time relative to the server cwd; in the container this is
// /app/data/chains, copied into the image at build time (no bind mount), so a
// data change means a rebuild.
const CHAINS_DIR = path.join(process.cwd(), "data", "chains");

export const listChains = cache(async (): Promise<Chain[]> => {
  let files: string[];
  try {
    files = await fs.readdir(CHAINS_DIR);
  } catch {
    return [];
  }
  const chains = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const raw = await fs.readFile(path.join(CHAINS_DIR, f), "utf8");
        return parseChain(f.replace(/\.json$/, ""), raw);
      }),
  );
  // One malformed file drops its own tile rather than taking down the index.
  return chains
    .filter((c): c is Chain => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** A file that exists but does not validate is a bug, not a 404. The schema is
 *  strict, so a mistyped optional key lands here instead of silently switching
 *  a feature off — say so rather than serving a blank page. */
function parseChain(slug: string, raw: string): Chain | null {
  const parsed = ChainSchema.safeParse(JSON.parse(raw));
  if (parsed.success) return parsed.data;
  console.error(
    `chain "${slug}" failed validation and will not be served:`,
    parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  );
  return null;
}

export const getChain = cache(async (slug: string): Promise<Chain | null> => {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(path.join(CHAINS_DIR, `${slug}.json`), "utf8");
  } catch {
    return null; // no such chain
  }
  return parseChain(slug, raw);
});

/**
 * Every chain's colour, in both themes.
 *
 * Resolved here rather than in the components that draw it: a chain's shade
 * depends on which other chains share its glyph, so it is a fact about the
 * whole roster and only the server holds that. Client components take a
 * resolved `Tint` as a prop.
 */
export const chainTints = cache(async (): Promise<Map<string, Tint>> => {
  const chains = await listChains();
  const peers = tintPeers(chains);
  const out = new Map<string, Tint>();
  for (const c of chains) {
    out.set(c.slug, tileTint(c.glyph, c.slug, peers.get(c.glyph ?? "") ?? []));
  }
  return out;
});

/** One chain's colour. Falls back to the brand teal for an unknown slug. */
export async function chainTint(slug: string): Promise<Tint> {
  const t = await chainTints();
  return t.get(slug) ?? { light: "#0d9488", dark: "#14b8a6" };
}
