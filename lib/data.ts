import { promises as fs } from "fs";
import path from "path";
import { cache } from "react";
import { Chain, ChainSchema } from "./schema";

// Resolved at request time relative to the server cwd; in the container this is
// /app/data/chains, which the compose file bind-mounts read-only.
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
        return ChainSchema.parse(JSON.parse(raw));
      }),
  );
  return chains.sort((a, b) => a.name.localeCompare(b.name));
});

export const getChain = cache(async (slug: string): Promise<Chain | null> => {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = await fs.readFile(
      path.join(CHAINS_DIR, `${slug}.json`),
      "utf8",
    );
    return ChainSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
});
