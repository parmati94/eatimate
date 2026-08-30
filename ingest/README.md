# Ingesting a chain

Admin-only. Output contract: a JSON file passing `lib/schema.ts` (`ChainSchema`),
dropped into `data/chains/<slug>.json`. Raw artifacts (source PDF, text dump,
extraction report) go to `data/raw/<slug>/` (gitignored).

## Process (as run for Qdoba, 2026-08-30)

1. **Fetch the official PDF** from the chain's own site only. Gotcha: some sites
   (qdoba.com) Cloudflare-403 plain curl even with browser headers — use
   `cloudscraper` (Python) or download by hand in a browser.
2. **Ground truth first:** dump all text and tables page by page with
   `pdfplumber` before extracting anything. Confirm the column order from the
   header row — do not assume it. Keep the dump in `data/raw/<slug>/`.
3. **Extract** components into the schema. Categories should model the chain's
   actual build flow (base / rice / beans / protein / ... ), `select: single`
   where you pick one, `multi` otherwise. Excluded by policy: allergens,
   calories-from-fat, potassium. `"<1"` values → 0.5. Drinks etc. measured in
   fl oz → `serving_g: null`, ounces in `serving_desc`.
4. **Validate:**
   - kcal ≈ 4·(protein_g + carbs_g) + 9·fat_g, flag when off by more than
     max(25% of calories, 20 kcal)
   - no negatives; unique component ids; every category referenced exists
   - spot-check ≥5 rows verbatim against the raw dump
5. **Menu-completion pass:** the PDF only has rows for things WITH nutrition —
   it cannot express zero-nutrient menu structure. After extraction, add the
   formats the menu offers that the PDF omits (plain bowl, naked burrito,
   salad without shell, water) as components with all-zero nutrients and
   `"synthetic": true`. Every non-synthetic number must trace to the PDF;
   synthetic entries are editorial and must be flagged. Check the chain's
   actual ordering flow (their website/app) to know what formats exist.
6. **Corrections policy:** never silently deviate from the printed value. If the
   PDF itself is wrong (impossible energy math, obvious typo), fix the value and
   record it in the component's `corrections[]`: `{field, printed, used, reason}`.
   If the value is merely implausible but consistent, keep as printed.
7. **Report:** write `data/raw/<slug>/report.md` — page count, method, per-
   category counts, flags, ambiguities, spot-checks.
8. Drop the JSON in `data/chains/`, load `/<slug>` locally, hand-check a real
   order against the PDF before considering it done.

Provenance is mandatory: `source.pdf_url` + `source.retrieved` (the date YOU
fetched it, not the PDF's internal date — Qdoba's says "2020" internally).
