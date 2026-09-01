# Ingesting a chain

Admin-only. Output contract: `data/chains/<slug>.json` passing `lib/schema.ts`.
Raw artifacts (source PDF, text dump, report) go to `data/raw/<slug>/` (gitignored).
Python deps live in `ingest/.venv` (`python3 -m venv ingest/.venv && ingest/.venv/bin/pip install pdfplumber cloudscraper pillow beautifulsoup4 lxml`). The last two are for `dump_html.py`.

## Pipeline (deterministic — same dump in, byte-identical JSON out)

Four dumpers, one intermediate. Whatever the source looks like, it becomes the
same `raw_dump.txt` — section headings followed by `name <numeric cells>` rows —
so nothing downstream knows where the data came from.

| Source shape | Dumper |
| --- | --- |
| PDF | `dump.py <slug> <file>.pdf` |
| HTML table, one row per item | `dump_html.py <slug>` |
| HTML transposed, columns are the chain-wide size | `dump_html.py <slug> --matrix` |
| HTML transposed, columns are sizes of one item | `dump_html.py <slug>`, page tagged `"mode": "items"` |
| Embedded / API JSON | `dump_json.py <slug>` |

With no source argument the dumpers read `meta.source` from the chain's own
config, so a refresh is just `dump_html.py <slug>`. A page list may mix modes.

**Finding the source in the first place.** Many chains render nutrition in the
browser from an XHR, so `curl` gets an empty shell and the payload is invisible:

```
ingest/.venv/bin/python ingest/capture.py <url> --slug <slug>
```

Opens the page in Chromium, saves every JSON response it makes to
`data/raw/<slug>/`, and reports which ones carry POPULATED nutrient values --
not merely nutrient-shaped keys. That distinction is the whole point: Potbelly's
ordering menu advertises `basecalories` on all 233 items and every one is null.
It reports and writes to data/raw only; nothing is ingested until a human looks.
It also prints the site's robots.txt rules first, for `*` and for named agents.

```
ingest/.venv/bin/python ingest/dump_html.py <slug>                 # -> data/raw/<slug>/raw_dump.txt
PYTHONPATH=ingest ingest/.venv/bin/python ingest/extract.py <slug>  # -> data/chains/<slug>.json
ingest/.venv/bin/python ingest/validate.py data/chains/<slug>.json
git diff data/chains/<slug>.json                                    # review
PYTHONPATH=ingest ingest/.venv/bin/python ingest/rebuild.py --check # nothing else drifted
```

## Has the source moved or changed?

```bash
ingest/.venv/bin/python ingest/refresh.py --all      # exit 1 if anything needs attention
```

Reports `ok` / `reexport` / `moved` / `changed` / `error` per chain, and writes
nothing. It answers the question a recorded URL alone cannot: a chain can
publish a new guide at a *new* URL while the old one keeps serving stale data
(Qdoba's did, for six years).

Three fields in `meta.source` drive it, and each exists because of a real
failure seen while building it:

- `page_url` — the chain's nutrition *page*, where the current asset link
  lives. Without it we can only detect a change at a URL we already know.
- `link_pattern` — which link on that page is ours. Every one of these pages
  offers several PDFs (BWW links a nutrition guide, an allergen guide, an
  ingredient list and a soybean-oil notice); without a pattern they all read
  as "moved".
- `fetch` — how to reach it, because no single client works everywhere:
  `plain`, `cloudscraper` (Cloudflare), `redirect` (Just Salad's /allergens
  302s at the current guide), `asset` (Wingstop's stable S3 path). Five Guys
  403s cloudscraper but answers a plain request, so heavier is not safer.

Two hashes, because one cannot tell these apart:

- `asset_sha256` — the bytes. Cheap, but a chain re-exporting an unchanged
  document trips it (Qdoba is doing exactly that today).
- `dump_sha256` — the text we actually parse, whitespace-normalised, so a
  trailing newline is not reported as a change. This is the authoritative one.

Page-sourced chains (Chick-fil-A, Panda, Papa John's) have no asset to
resolve, so they are re-dumped and compared on `dump_sha256` instead.

`ingest/overview.py` prints two tables: which optional presentation fields each
chain uses (and therefore what shape it renders as), and each chain's
extraction knobs — including whether a new row ERRORs or is absorbed.

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
- `section_categories` — `"SECTION" -> cat`, a default for a whole section, so a
  homogeneous section needs no per-item entries. Options: `{"strict": true}`
  makes the section ignore items entries from *other* sections (Papa John's
  sells a "BBQ Sauce" as both a pizza sauce and a dipping cup); `{"only": [...]}`
  keeps just the named items (Papa John's publishes its bottler's entire
  153-drink catalogue).
- `variant_split` — a separator in a printed name (`Cheesesticks / 10"`) marking
  a size family. First size seen heads it, the rest point at it, and the builder
  collapses them into one row with a size selector.
- `layout.serving_brackets` — lift a trailing `[...]` off a printed name into
  `serving_desc`. `dump_html` "items" mode puts the source's own serving size
  there, and it is load-bearing: a Papa John's Papa Bite row is per BITE with 8
  to an order.
- `corrections` — `component id -> [{field, used, reason}]`; see the policy below.

`extract.py` **fails loudly**: any PDF row not in `items` (and not covered by a
`section_categories` default), any unparsed non-empty line, duplicate ids, or
unknown categories abort the run. That is deliberate — a new seasonal item or a
layout change must be noticed, never silently dropped or mis-bucketed.

## Presentation: start from the closest chain

Nothing declares a chain "type". The builder reacts to whichever optional fields
the data carries, so a chain's shape is emergent — which means the fastest way
to add one is to copy the config of the chain that already looks like it, not to
start from scratch. `validate.py` prints the resulting shape back at you.

Every config key is documented in `common.py`'s module docstring — that is the
reference, and it is kept complete. This table is only what each one *looks*
like on the page.

| Field | Where | What appears |
| --- | --- | --- |
| `size_modes` | `meta` | format selector (Subway 6" / Footlong) |
| `size_modes[].portion_count` + `portion` | `meta` | "slices eaten" stepper |
| `flow: "preset"` on a category | `categories` | menu-item / build-your-own fork |
| `flow: "both"` | `categories` | a numbered step on EITHER path |
| `flow: "extras"` | `categories` | collapsed add-on section |
| `in_preset` on a category | `categories` | hidden on the menu path — a named item already has one |
| `feature` on components | set per chain | "Make it a meal" shelf |
| `variant_of` / `variant_label` | components | one row with a size selector |
| `addon_of` | components | nested under the row it extends |
| `name_trim` + `dedupe` | top level | the two above, derived from tidy names |

| Shape | Copy from | Chains |
| --- | --- | --- |
| plain ingredient list | `cava.json` | Chipotle, Cafe Rio, Panda Express, Wingstop |
| format-first, no published whole items | `moes.json` | Moe's |
| preset fork + formats as chips | `subway.json` | Subway, Just Salad, Qdoba, CAVA, DIG |
| preset fork, size chosen first | `potbelly.json` | Potbelly, Jimmy John's |
| format-first + per-portion | `papajohns.json` | Papa John's, Domino's |
| preset fork + meal shelf | `chickfila.json` | Chick-fil-A |
| meal shelf only | `fiveguys.json` | Five Guys |
| per-tier values by mode | `bww.json` | Buffalo Wild Wings |

Note the grouping is structural, not culinary: Papa John's sits with Domino's
because a crust x size multiplying every topping is the same problem twice. The
split inside the sandwich chains is real though — Subway publishes each named
item complete at its own format, so the format is a chip on the item; Potbelly
and Jimmy John's publish per-size figures, so the size has to be chosen before
the sandwich list means anything.

Whichever you copy, `lib/consistency.test.ts` will fail the build if the new
chain drifts from what its cuisine peers do without saying why in
`meta.consistency`.

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
4. **Record how to find it again**, while you still have it open: set
   `source.page_url` (the nutrition *page*), `source.link_pattern` (which link on
   that page is ours — most pages offer several PDFs) and `source.fetch`
   (`plain` / `cloudscraper` / `redirect` / `asset`; try plain first, a heavier
   client is not a safer one). Then `refresh.py --record <slug>` to pin the
   hashes. Skip this and the chain is invisible to `refresh.py` forever, which
   is how a source goes quietly stale.
5. **Menu-completion pass:** add `synthetic` entries for formats the menu offers
   but the PDF omits (bowl, salad without shell, water). Check the chain's
   ordering site to know what exists.
6. `validate.py`: energy check kcal ≈ 4·(protein+carbs) + 9·fat within
   max(25%, 20 kcal); sat+trans ≤ fat; fiber+sugar ≤ carbs; negatives; ids.
7. **Corrections policy:** never silently deviate from the printed value, and
   never substitute an outside source. A value may only be changed where the
   source contradicts *itself within one row*, and the change is recorded as
   `{field, printed, used, reason}` in `corrections[]` and rendered in the page
   footer. Two routes:
   - automatic — `cff_corrections`, when printed Total Fat makes the energy math
     impossible but the PDF's own calories-from-fat ÷ 9 makes it consistent;
   - declared — a `corrections` block in the chain config, for anything else the
     row settles on its own (Papa John's prints Coke Zero at 0 kcal *and* 66 g
     carbohydrate; 66 g is ~264 kcal, and its own 0 g sugar agrees with 0 g carb).

   Anything the row does NOT settle: keep as printed and list it in the report.
7. **Report** `data/raw/<slug>/report.md`: source + date, row/component counts,
   modeling decisions, flags kept as printed, spot-checks verbatim vs the dump.
8. Load `/<slug>`, hand-check a real order against the PDF.

## Re-ingesting (seasonal menus, new chart)

Nothing watches for this yet — scheduled checking and alerting are deliberately
deferred (see PLAN.md). Keeping the data current is a manual habit, and these
two commands are the whole of it:

```bash
ingest/.venv/bin/python ingest/refresh.py --all   # has any source moved or changed?
PYTHONPATH=ingest ingest/.venv/bin/python ingest/overview.py   # how old is each chain?
```

`overview.py` ends with a FRESHNESS table — age of every chain's source, oldest
first, flagged past 90 and 180 days. DIG and Just Salad rotate seasonally, so
they age fastest.

When a chain does need re-ingesting:

1. **Fetch the current source** from the URL `refresh.py` reported, into
   `data/raw/<slug>/`. Keep the old one alongside it — that archive is the only
   record of what the chain published before, and it is gitignored, so nothing
   else keeps it.
2. `dump.py` / `dump_html.py` / `dump_json.py`, then `extract.py`.
   **Expect extraction to fail if the chain added items** — that is the design.
   Add the new rows to `items` until it passes; a section with a blanket default
   absorbs them silently instead, and only reports a count.
3. `validate.py`, then **read `git diff data/chains/<slug>.json`**. This is the
   real review: values that moved, items added, items withdrawn. For chains with
   blanket section defaults it is the only place a new item surfaces at all.
4. **`refresh.py --record <slug>`** — re-pins `asset_sha256`, `dump_sha256` and
   `retrieved`. Skipping this is the easy mistake: `refresh.py` then reports
   "changed" on every future run until you stop believing it.
5. Re-run `extract.py` so the shipped `retrieved` date matches, then
   `rebuild.py --check` and `npm test`.

Provenance is mandatory: `source.pdf_url` + `source.retrieved` (the date YOU
fetched it, not the PDF's internal date).
