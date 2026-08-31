import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { Chain, ChainSchema } from "./schema";

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
