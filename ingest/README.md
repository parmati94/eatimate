# Ingesting a chain

Admin-only. Output contract: `data/chains/<slug>.json` passing `lib/schema.ts`.
Raw artifacts (source PDF, text dump, report) go to `data/raw/<slug>/` (gitignored).
Python deps live in `ingest/.venv` (`python3 -m venv ingest/.venv && ingest/.venv/bin/pip install pdfplumber cloudscraper pillow beautifulsoup4 lxml`). The last two are for `dump_html.py`.

## Pipeline (deterministic — same PDF in, byte-identical JSON out)

```
ingest/.venv/bin/python ingest/dump.py <slug> data/raw/<slug>/<file>.pdf   # -> data/raw/<slug>/raw_dump.txt
PYTHONPATH=ingest ingest/.venv/bin/python ingest/extract.py <slug>          # -> data/chains/<slug>.json
ingest/.venv/bin/python ingest/validate.py data/chains/<slug>.json
git diff data/chains/<slug>.json                                            # review
```

All chain-specific knowledge is **data** in `ingest/chains/<slug>.json`:
- `layout` — the PDF's column order, whether rows carry an allergen token, how the
  serving cell is read (`g` / `oz` / none, plus `floz_sections` for drinks), section
  header / skip / footer regexes. Confirm the column order from the header row of
  the dump every time — Qdoba changed theirs between 2020 and 2026.
- `items` — printed row name → `{cat, id?, name?, desc?}` or `{skip: reason}`.
  Category is the one thing a human must decide (the PDF has no idea what a
  "base" is). id/name/serving_desc are derived from the printed row unless
  overridden; keep ids stable across re-ingests so bookmarked `?m=` links survive.
  Table order = display order within a category. Repeated printed names are
  addressed as `"<name> [#2]"`.
- `synthetic` — zero-nutrient menu structure the PDF can't express (plain bowl,
  water). Editorial; flagged `synthetic: true` in the output.

`extract.py` **fails loudly**: any PDF row not in `items` (and not covered by a
`section_categories` default), any unparsed non-empty line, duplicate ids, or
unknown categories abort the run. That is deliberate — a new seasonal item or a
layout change must be noticed, never silently dropped or mis-bucketed.

## Runbook for a new chain
1. **Fetch the official PDF** from the chain's own site. Many sites Cloudflare-403
   curl — use `cloudscraper`. Scrape the nutrition *page* for the current PDF link;
   asset URLs are often per-version (DIG: Storyblok hash; Qdoba: Contentful) and the
   old URL may keep serving stale data (Qdoba's did, for 6 years).
2. `dump.py`, then read the dump: confirm column order from the header, note
   section names, wrapped names, `-`/`<1` cells, fused page footers.
3. Write `ingest/chains/<slug>.json`: layout first, run `extract.py` — it will list
   every unconsumed row; fill in `items` until it passes. Categories model the
   chain's actual build flow (`select: single` where you pick one). Excluded by
   policy: allergens, calories-from-fat, potassium (parse them, don't emit them).
4. **Menu-completion pass:** add `synthetic` entries for formats the menu offers
   but the PDF omits (bowl, salad without shell, water). Check the chain's
   ordering site to know what exists.
5. `validate.py`: energy check kcal ≈ 4·(protein+carbs) + 9·fat within
   max(25%, 20 kcal); sat+trans ≤ fat; fiber+sugar ≤ carbs; negatives; ids.
6. **Corrections policy:** never silently deviate from the printed value. The only
   automatic correction is `cff_corrections`: when printed Total Fat makes the
   energy math impossible but the PDF's own calories-from-fat ÷ 9 makes it
   consistent, use that and record `{field, printed, used, reason}` in
   `corrections[]`. Anything else implausible: keep as printed, list in the report.
7. **Report** `data/raw/<slug>/report.md`: source + date, row/component counts,
   modeling decisions, flags kept as printed, spot-checks verbatim vs the dump.
8. Load `/<slug>`, hand-check a real order against the PDF.

## Re-ingesting (seasonal menus, new chart)
Re-fetch → `dump.py` → `extract.py`. New items show up as unconsumed rows; removed
items just disappear from the diff; changed values show in `git diff`. Update
`meta.source` (url + retrieved date). Keep the previous JSON in `data/raw/<slug>/`
for reference.

Provenance is mandatory: `source.pdf_url` + `source.retrieved` (the date YOU
fetched it, not the PDF's internal date).
