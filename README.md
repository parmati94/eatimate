# Eatimate

**Free nutrition calculators for build-your-own restaurant meals** — pick your
ingredients, get exact calories and macros. Live at [eatimate.app](https://eatimate.app).

Restaurant chains publish per-ingredient nutrition data, but usually as a giant
PDF with no way to add anything up. Eatimate ingests those official documents
once, then serves a fast, mobile-first meal builder per chain: tap through the
line the way you'd order (base → protein → toppings → sauces), watch an
FDA-style nutrition label total up live, share any meal as a URL, and save the
label as an image or text for trackers like Lose It!.

Currently covered, 1,672 ingredients across 11 chains: **CAVA · Chick-fil-A ·
DIG · Five Guys · Just Salad · Moe's Southwest Grill · Panda Express ·
Papa John's · Qdoba · Subway · Wingstop**

## How it works

```
chain's published data ──▶ ingest pipeline ──▶ data/chains/<slug>.json ──▶ SSR page /<slug>
  PDF · HTML · JSON          (Python, offline)      (the "database")          (Next.js)
```

- **The repo is the database.** One JSON file per chain, validated by a zod
  schema, committed to git — a data update is a reviewable diff. The data ships
  inside the image, so adding a chain is dropping a file and rebuilding.
- **Config-driven ingestion** (`ingest/`): chains publish as PDF, HTML table,
  transposed HTML matrix, or embedded JSON, and three dumpers normalise those
  four shapes into one intermediate text format. From there a single shared
  parser ([`common.py`](ingest/common.py)) is driven by per-chain config
  ([`ingest/chains/*.json`](ingest/chains)) — column order, section regexes,
  and an items table mapping printed rows to builder categories. **No chain has
  its own code path.** Extraction is deterministic: same dump in →
  byte-identical JSON out, enforced by `rebuild.py --check`.
- **Unrecognised rows fail loudly** — an unparsed line, a duplicate id, or a row
  the config doesn't place aborts the run, so a seasonal menu change can't be
  silently mis-parsed. The exception is a section given a blanket default: there
  a new row is absorbed into that category and reported as a count, which trades
  a loud failure for less churn. `ingest/overview.py` shows which chains are in
  which mode.
- **Presentation is emergent, not declared.** Nothing says "render Papa John's
  as a pizza". A chain that carries `size_modes` gets a format selector, one
  with a `portion` block gets a "slices eaten" control, one with a `preset`
  category flow gets a menu-item fork. The builder reacts to whichever optional
  fields the data uses, so a new chain adds no UI code.
- **Provenance is mandatory.** Every number traces to the chain's published
  document (source URL + retrieval date in each file). Printed values are never
  silently altered. A value is only ever changed where the source contradicts
  itself *within one row*, it records `{printed, used, reason}`, and the page
  lists every such change in its footer.
- **Server-rendered, client-computed.** Chain pages are SSR (every ingredient
  in the HTML); the builder is a client component doing pure local math — no
  API calls after page load, no database, no accounts.
- **Display rounding follows FDA labeling rules** (21 CFR 101.9), applied only
  at render time; raw values are stored unrounded.

## Stack

Next.js (App Router, TypeScript, Tailwind) · zod · vitest · Python with
pdfplumber and BeautifulSoup for ingestion · Docker (multi-arch amd64/arm64
images built on native GitHub runners, published to GHCR)

## Development

No host Node needed — the dev loop is containerized:

```bash
docker compose -f docker-compose.dev.yml up   # http://localhost:3100, hot reload
```

Tests (pure logic — FDA rounding, meal totals, share links):

```bash
npm test
```

Production image:

```bash
docker compose up -d --build                   # or: docker pull ghcr.io/parmati94/eatimate
```

### Ingesting a chain

See [`ingest/README.md`](ingest/README.md) for the full runbook:

```bash
python ingest/dump.py <slug> <pdf>              # PDF  ─┐
python ingest/dump_html.py <slug>               # HTML ─┼─▶ data/raw/<slug>/raw_dump.txt
python ingest/dump_json.py <slug>               # JSON ─┘
PYTHONPATH=ingest python ingest/extract.py <slug>
python ingest/validate.py data/chains/<slug>.json
python ingest/rebuild.py --check                # every chain still matches its config
```

## Disclaimers

Eatimate is not affiliated with or endorsed by any restaurant listed. Nutrition
values are approximations derived from each chain's published data; actual
values vary with portioning and preparation. Verify allergen and dietary
decisions with the restaurant directly.
