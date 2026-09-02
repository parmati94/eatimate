# Eatimate

**Free nutrition calculators for build-your-own restaurant meals** — pick your
ingredients, get exact calories and macros. Live at [eatimate.app](https://eatimate.app).

Restaurant chains publish per-ingredient nutrition data, but usually as a giant
PDF with no way to add anything up. Eatimate ingests those official documents
once, then serves a fast, mobile-first meal builder per chain: tap through the
line the way you'd order (base → protein → toppings → sauces), watch an
FDA-style nutrition label total up live, share any meal as a URL, and save the
label as an image or text for trackers like Lose It!.

Currently covered, 4,686 ingredients and menu items across 21 chains:
**Buffalo Wild Wings · Burger King · CAVA · Cafe Rio · Chick-fil-A · Chipotle ·
Chopt · DIG · Domino's · Five Guys · Jimmy John's · Just Salad · Little Caesars ·
Moe's Southwest Grill · Panda Express · Papa John's · Potbelly · Qdoba · Subway ·
Whataburger · Wingstop**

## How it works

```
chain's published data ──▶ ingest pipeline ──▶ data/chains/<slug>.json ──▶ SSR page /<slug>
  PDF · HTML · JSON          (Python, offline)      (the "database")          (Next.js)
```

- **The repo is the database.** One JSON file per chain, validated by a zod
  schema, committed to git — a data update is a reviewable diff. The data ships
  inside the image, so adding a chain is dropping a file and rebuilding.
- **Config-driven ingestion** (`ingest/`): chains publish as PDFs, HTML tables,
  transposed HTML matrices, embedded JSON, CMS and ordering APIs, and one
  transcribed flyer. Six dumpers normalise those shapes into one intermediate
  text format, and one registry ([`formats.py`](ingest/formats.py)) says which
  dumper and which change check each shape gets. From there a single shared
  parser ([`common.py`](ingest/common.py)) is driven by per-chain config
  ([`ingest/chains/*.json`](ingest/chains)) — column order, section regexes,
  and an items table mapping printed rows to builder categories. **No chain has
  its own code path.** Extraction is deterministic: same dump in →
  byte-identical JSON out. The dumps are tracked, so `rebuild.py --check`
  proves it in CI on every push, not just on the machine that fetched the
  source.
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
- **A total is the exact sum of published values.** Nothing is rounded to FDA
  label increments: the stored figures are already each chain's published
  numbers, so rounding their sum would add error rather than remove it — and it
  made a 5-calorie sauce appear to move a total by 10. Display rounding does
  one job, keeping summed grams legible (4.5 + 0.5 + 7.8, not 12.799999999).

## Stack

Next.js (App Router, TypeScript, Tailwind) · zod · vitest · Python with
pdfplumber and BeautifulSoup for ingestion · Docker (multi-arch amd64/arm64
images built on native GitHub runners, published to GHCR)

## Development

No host Node needed — the dev loop is containerized:

```bash
docker compose -f docker-compose.dev.yml up   # http://localhost:3100, hot reload
```

Tests (pure logic — display rounding, meal totals, share links):

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
python3 -m venv ingest/.venv && ingest/.venv/bin/python -m pip install -r ingest/requirements.txt
python ingest/dump.py <slug> <pdf>              # PDF, or dump_html.py / dump_json.py /
                                                # dump_sanity.py / dump_compose.py / dump_nutritionix.py
                                                # ─▶ data/raw/<slug>/raw_dump.txt
PYTHONPATH=ingest python ingest/extract.py <slug>
python ingest/validate.py data/chains/<slug>.json
python ingest/rebuild.py --check                # every chain still matches its config
python ingest/refresh.py --all                  # has any chain's source moved or changed?
```

Tests for the parser's mechanisms live in `ingest/tests/` (`pytest`); CI runs
them alongside the config validator, `validate.py` and `rebuild.py --check`.

## Disclaimers

Eatimate is not affiliated with or endorsed by any restaurant listed. Nutrition
values are approximations derived from each chain's published data; actual
values vary with portioning and preparation. Verify allergen and dietary
decisions with the restaurant directly.
