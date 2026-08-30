# Eatimate

**Free nutrition calculators for build-your-own restaurant meals** — pick your
ingredients, get exact calories and macros. Live at [eatimate.app](https://eatimate.app).

Restaurant chains publish per-ingredient nutrition data, but usually as a giant
PDF with no way to add anything up. Eatimate ingests those official documents
once, then serves a fast, mobile-first meal builder per chain: tap through the
line the way you'd order (base → protein → toppings → sauces), watch an
FDA-style nutrition label total up live, share any meal as a URL, and copy the
label as text into trackers like Lose It!.

Currently covered: **Qdoba · Moe's Southwest Grill · DIG · CAVA · Just Salad**

## How it works

```
official chain PDF ──▶ ingest pipeline ──▶ data/chains/<slug>.json ──▶ SSR page /<slug>
      (source)          (Python, offline)      (the "database")          (Next.js)
```

- **The repo is the database.** One JSON file per chain, validated by a zod
  schema, committed to git — a data update is a reviewable diff. The app reads
  the data directory at request time; adding a chain is dropping a file.
- **Config-driven ingestion** (`ingest/`): a shared parser
  ([`common.py`](ingest/common.py)) driven by per-chain config
  ([`ingest/chains/*.json`](ingest/chains)) — the PDF's column order, section
  regexes, and an items table mapping printed rows to builder categories.
  Extraction is deterministic (same PDF in → byte-identical JSON out) and
  **fails loudly**: any unconsumed row, unparsed line, or duplicate id aborts
  the run, so a chain's seasonal menu change can never be silently mis-parsed.
- **Provenance is mandatory.** Every number traces to the chain's published
  document (source URL + retrieval date in each file). Printed values are never
  silently altered; the one automatic correction rule (total fat contradicted
  by the PDF's own calories-from-fat column) records `{printed, used, reason}`
  in the data itself.
- **Server-rendered, client-computed.** Chain pages are SSR (every ingredient
  in the HTML); the builder is a client component doing pure local math — no
  API calls after page load, no database, no accounts.
- **Display rounding follows FDA labeling rules** (21 CFR 101.9), applied only
  at render time; raw values are stored unrounded.

## Stack

Next.js (App Router, TypeScript, Tailwind) · zod · Python + pdfplumber for
ingestion · Docker (multi-arch amd64/arm64 images built on native GitHub
runners, published to GHCR)

## Development

No host Node needed — the dev loop is containerized:

```bash
docker compose -f docker-compose.dev.yml up   # http://localhost:3100, hot reload
```

Production image:

```bash
docker compose up -d --build                   # or: docker pull ghcr.io/parmati94/eatimate
```

### Ingesting a chain

See [`ingest/README.md`](ingest/README.md) for the full runbook:

```bash
python ingest/dump.py <slug> <pdf> [--tables]   # pdfplumber text/table dump
PYTHONPATH=ingest python ingest/extract.py <slug>
python ingest/validate.py data/chains/<slug>.json
```

## Disclaimers

Eatimate is not affiliated with or endorsed by any restaurant listed. Nutrition
values are approximations derived from each chain's published data; actual
values vary with portioning and preparation. Verify allergen and dietary
decisions with the restaurant directly.
