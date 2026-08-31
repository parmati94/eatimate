"""Usage: dump_html.py <slug> [url|file.html] [--min-nums N] [--all-rows]
                      [--matrix] [--plain-ua]

With no source argument, reads meta.source.html_url (or pdf_url) from
ingest/chains/<slug>.json -- so a refresh is just `dump_html.py <slug>`.

HTML counterpart to dump.py. Emits the SAME raw_dump.txt shape the PDF dumper
produces -- section heading lines followed by "name  <numeric cells>" rows --
so ingest/chains/<slug>.json column specs and common.py work unchanged.

Two sources of HTML:
  * a URL, fetched with a browser User-Agent (many chain sites 403 otherwise)
  * a local .html file -- use this for bot-walled sites (Panda Express and
    friends). Save the FULLY RENDERED DOM from a real browser; a plain
    "view-source" save misses JS-injected tables, and print-to-PDF destroys
    the table structure entirely.

Section headings come from the nearest preceding h1-h6/caption, or from a
single-cell row inside the table (chains often use those as group headers).

Three table shapes, one raw_dump:
  plain     rows are items, columns are nutrients (the common case)
  --matrix  transposed: nutrients down the side, columns are the chain-wide
            size mode (Papa John's crust x size)
  "items"   transposed, but each column is a size or flavour of the ONE item
            the table is about (sides, wings, drinks). Set per page in
            meta.source.html_urls as {"url":..., "mode":"items", "section":...};
            a page list may mix "items" pages with --matrix ones.

--min-nums N  how many numeric cells a row needs to count as data (default 4)
--all-rows    also emit rows that fell below that threshold, prefixed "?? ",
              so nothing is silently dropped while you tune a new chain
"""
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
# DataDome (Panda Express) fingerprints on client-hint COMPLETENESS, not the UA
# string -- a Chrome UA alone still gets 403. Send the full browser header set.
BROWSER_HEADERS = {
    "User-Agent": UA,
    "Accept": ("text/html,application/xhtml+xml,application/xml;q=0.9,"
               "image/avif,image/webp,image/apng,*/*;q=0.8"),
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}
# Values as printed: "<1", "-", "N/A", "1,010", "2.5" all count as numeric.
# NOTE: plain integers must be unbounded in length. An earlier \d{1,3}
# grouping silently rejected 4-digit values, so sodium (1110) vanished and
# every later column shifted left by one. Ragged-row detection caught it.
NUM = re.compile(r"^(?:<\s?1|--?|N/?A|\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$", re.I)
HEADINGS = ("h1", "h2", "h3", "h4", "h5", "h6", "caption", "legend")


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\xa0", " ")).strip()


def load(src, plain_ua=False):
    """plain_ua: send requests' own agent. Papa John's inverts the usual wall --
    a browser-like agent gets a 16KB "Technical Difficulties" decoy, while a
    plain client gets the real 240KB page."""
    if src.startswith(("http://", "https://")):
        headers = None if plain_ua else BROWSER_HEADERS
        r = requests.get(src, headers=headers, timeout=60)
        r.raise_for_status()
        # requests falls back to latin-1 when a page declares no charset, which
        # turns "Jalapeño" into "JalapeÃ±o". These pages are all utf-8.
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text
    return Path(src).read_text(encoding="utf-8", errors="replace")


def config_source(slug):
    """The source URL recorded in ingest/chains/<slug>.json."""
    import json
    cfg = Path(f"ingest/chains/{slug}.json")
    if not cfg.exists():
        sys.exit(f"error: no source given and {cfg} does not exist")
    meta = json.loads(cfg.read_text()).get("meta", {})
    source = meta.get("source", {})
    url = (source.get("html_urls") or source.get("html_url")
           or source.get("pdf_url") or source.get("url"))
    if not url:
        sys.exit(f"error: {cfg} has no meta.source.html_url/pdf_url to fetch")
    print(f"source from config: {url if isinstance(url, str) else len(url)} "
          + ("" if isinstance(url, str) else "pages"))
    return url, bool(source.get("plain_ua")), bool(source.get("matrix"))


def strip_label(cell, label):
    """Drop a repeated column label prefix from a responsive-table cell."""
    if label and cell != label and cell.lower().startswith(label.lower()):
        return cell[len(label):].strip(" :\u00a0")
    return cell


def section_for(table):
    """Nearest preceding heading, walking back through the document."""
    cap = table.find("caption")
    if cap and norm(cap.get_text()):
        return norm(cap.get_text())
    node = table
    for _ in range(400):
        node = node.find_previous(HEADINGS)
        if node is None:
            return None
        text = norm(node.get_text())
        if text:
            return text
    return None



# --- transposed ("matrix") tables ------------------------------------------
# Papa John's publishes one table per topping with nutrients down the side and
# crust x size across the top, which is the transpose of every other source we
# read. Emitting it grouped by column turns each crust/size into a section of
# ordinary "name value value ..." rows, so nothing downstream has to know.

SKIP_HEADINGS = re.compile(r"^(serving size|nutritional information)$", re.I)
UNIT = re.compile(r"(?<=[\d.])\s*(g|mg|mcg|kcal|cal)\b", re.I)
# Papa John's prints a missing value as "--" or "--g" -- no digit, so UNIT
# leaves the unit attached. Both mean the same as a single "-".
BLANK = re.compile(r"^-+\s*(?:g|mg|mcg|kcal|cal)?$", re.I)


def cell(text):
    """One table cell as a bare number, or '-' when the source has no value."""
    v = UNIT.sub("", text).strip()
    if not v or v.upper() in ("N/A", "NA") or BLANK.match(v):
        return "-"
    return v


def _cells(tr):
    """Row cells with colspan expanded, so header columns line up with data."""
    out = []
    for c in tr.find_all(["td", "th"]):
        text = norm(c.get_text(" "))
        out.extend([text] * max(1, int(c.get("colspan", 1) or 1)))
    return out


def _item_name(table):
    node = table
    for _ in range(12):
        node = node.find_previous(HEADINGS)
        if node is None:
            return None
        text = norm(node.get_text(" "))
        if text and not SKIP_HEADINGS.match(text):
            return text
    return None


def matrix_rows(soup, min_nums):
    """[(column_label, item_name, [values])] for every transposed table."""
    out = []
    for table in soup.find_all("table"):
        rows = [_cells(tr) for tr in table.find_all("tr")]
        rows = [r for r in rows if any(r)]
        if len(rows) < 3:
            continue
        body = [r for r in rows[2:] if len(r) > 1]
        # A nutrition table has many numeric-ish rows; a serving-size table does not.
        numeric = sum(1 for r in body
                      if NUM.match(UNIT.sub("", r[1]).strip() or "x"))
        if numeric < min_nums:
            continue
        width = max(len(r) for r in rows)
        head1 = rows[0] + [""] * (width - len(rows[0]))
        head2 = rows[1] + [""] * (width - len(rows[1]))
        name = _item_name(table) or "UNKNOWN"
        for i in range(1, width):
            group, sub = head1[i], head2[i]
            if sub.upper() in ("N/A", "NA", ""):
                label = group
            elif group.upper() in ("N/A", "NA", ""):
                label = sub
            else:
                label = f"{group} {sub}"
            if not label:
                continue
            vals = [cell(r[i]) if i < len(r) else "-" for r in body]
            out.append((label, name, vals))
    return out


# --- per-item tables ("items" mode) ----------------------------------------
# Sides, wings, dipping sauces and friends publish one table per item with the
# nutrients down the side and each COLUMN a size or flavour of that item. That
# is the transpose of --matrix, where the columns are the chain-wide size mode.
# Emitting column-per-row under a configured section heading turns them into
# ordinary rows, so section_categories/items handle them like any other chain.

CALORIES = re.compile(r"^total calories$", re.I)


SERVING = re.compile(r"^serving size$", re.I)


def item_rows(soup, section):
    """[(section, name, values)] -- one row per data column.

    The serving size sits in its own small table above the nutrients, and it is
    load-bearing: a Papa Bite row is per BITE with 8 to an order. Carry it into
    the emitted name as "[...]" so the extractor can lift it out."""
    out, servings = [], {}
    for table in soup.find_all("table"):
        rows = [_cells(tr) for tr in table.find_all("tr")]
        rows = [r for r in rows if any(r)]
        if not rows:
            continue
        name = _item_name(table) or "UNKNOWN"
        serving = next((r for r in rows if SERVING.match(r[0])), None)
        if serving:
            servings[name] = serving
            continue
        # A nutrition table is the one whose left column starts the nutrient
        # list; the serving-size table that precedes it does not.
        if not any(CALORIES.match(r[0]) for r in rows):
            continue
        head = None if CALORIES.match(rows[0][0]) else rows[0]
        body = rows[1:] if head else rows
        width = max(len(r) for r in body)
        serving = servings.get(name, [])
        for i in range(1, width):
            col = head[i] if head and i < len(head) else ""
            vals = [cell(r[i]) if i < len(r) else "-" for r in body]
            label = f"{name} / {col}" if col else name
            # One serving cell may cover every column ("1 cup" for all sauces).
            sv = serving[i] if i < len(serving) else (serving[-1] if len(serving) > 1 else "")
            # "1 Papa Bite 8 Papa Bites per order" -> "1 Papa Bite (8 ... order)"
            sv = re.sub(r"^(.+?) (\d+ .*per order)$", r"\1 (\2)", sv)
            out.append((section, f"{label} [{sv}]" if sv else label, vals))
    return out


def emit_items(entries, plain_ua, min_nums):
    """Lines for every 'items'-mode page, grouped under its configured section."""
    lines, count = [], 0
    for e in entries:
        soup = BeautifulSoup(load(e["url"], plain_ua), "lxml")
        for junk in soup(["script", "style", "noscript"]):
            junk.decompose()
        section = e.get("section") or Path(e["url"]).stem.title()
        found = item_rows(soup, section)
        if not found:
            print(f"  WARNING no nutrition tables found on {e['url']}")
            continue
        lines.append(f"\n===== {section} =====")
        lines.append(section)
        widths = set()
        for _, name, vals in found:
            lines.append(f"{name} {' '.join(vals)}")
            widths.add(len(vals))
        count += len(found)
        print(f"  {section}: {len(found)} rows")
        if len(widths) > 1:
            print(f"  WARNING {section}: inconsistent value counts {sorted(widths)}")
    return lines, count


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    slug = args[0]
    # Re-ingest ergonomics: with no source given, read it from the chain's own
    # config so refreshing a chain is just `dump_html.py <slug>` -- no URL to
    # remember, and one place to update when a chain moves its page.
    plain_ua = "--plain-ua" in sys.argv
    matrix = "--matrix" in sys.argv
    if len(args) > 1:
        src = args[1]
    else:
        src, cfg_plain, cfg_matrix = config_source(slug)
        plain_ua = plain_ua or cfg_plain
        matrix = matrix or cfg_matrix
    min_nums = 4
    if "--min-nums" in sys.argv:
        min_nums = int(sys.argv[sys.argv.index("--min-nums") + 1])
    all_rows = "--all-rows" in sys.argv

    # A page list may mix modes: a chain can publish its build-your-own tables
    # transposed by size (--matrix) and its sides one table per item ("items").
    entries = src if isinstance(src, list) else [src]
    items = [e for e in entries if isinstance(e, dict) and e.get("mode") == "items"]
    rest = [e["url"] if isinstance(e, dict) else e for e in entries if e not in items]

    out = Path(f"data/raw/{slug}/raw_dump.txt")
    out.parent.mkdir(parents=True, exist_ok=True)
    item_lines, item_count = emit_items(items, plain_ua, min_nums) if items else ([], 0)

    if not rest:
        out.write_text("\n".join(item_lines) + "\n")
        print(f"{item_count} item rows -> {out}")
        return

    # A chain may publish one item type per page; concatenating the documents
    # keeps a single raw dump, which is what the extractor expects.
    html = "\n".join(load(u, plain_ua) for u in rest)
    soup = BeautifulSoup(html, "lxml")
    for junk in soup(["script", "style", "noscript"]):
        junk.decompose()

    if matrix:
        found = matrix_rows(soup, min_nums)
        if not found:
            sys.exit("error: --matrix found no transposed tables")
        by_col = {}
        for label, name, vals in found:
            by_col.setdefault(label, []).append((name, vals))
        lines = []
        for label, rows in by_col.items():
            lines.append(f"\n===== {label} =====")
            lines.append(label)
            for name, vals in rows:
                lines.append(f"{name} {' '.join(vals)}")
        out.write_text("\n".join(lines + item_lines) + "\n")
        print(f"{len(by_col)} column groups, {len(found)} rows -> {out}")
        widths = {len(v) for _, _, v in found}
        if len(widths) > 1:
            print(f"  WARNING inconsistent value counts across tables: {sorted(widths)}")
        return

    lines, kept, skipped, tables = [], 0, 0, soup.find_all("table")
    ragged = []
    for n, table in enumerate(tables, 1):
        lines.append(f"\n===== TABLE {n} =====")
        sec = section_for(table)
        if sec:
            lines.append(sec)
        widths = {}
        # Responsive tables (Panda Express) repeat the column label inside every
        # cell for mobile layouts -- "Calories 410" instead of "410". Learn the
        # labels from the header row and strip them off by position.
        labels = []
        for tr in table.find_all("tr"):
            head = [norm(c.get_text(" ")) for c in tr.find_all(["td", "th"])]
            if len(head) > 2 and not any(NUM.match(c) for c in head if c):
                labels = head
                break

        for tr in table.find_all("tr"):
            cells = [norm(td.get_text(" ")) for td in tr.find_all(["td", "th"])]
            if labels and cells is not labels:
                cells = [strip_label(c, labels[i] if i < len(labels) else "")
                         for i, c in enumerate(cells)]
            # NEVER drop empty cells -- an empty <td> is a missing value, and
            # collapsing it shifts every later column left (carbs land in the
            # sodium slot). Blanks become "-", which NUM accepts, so position
            # is preserved. Only trailing empties are trimmed.
            while cells and cells[-1] == "":
                cells.pop()
            if not any(cells):
                continue
            # A lone populated cell spanning the row is a group header.
            if len([c for c in cells if c]) == 1 and len(cells) <= 2:
                lines.append(next(c for c in cells if c))
                continue
            name = cells[0] or "(unnamed)"
            rest = [c if c else "-" for c in cells[1:]]
            nums = [c for c in rest if NUM.match(c)]
            if len(nums) >= min_nums:
                lines.append(f"{name} {' '.join(nums)}")
                widths[len(nums)] = widths.get(len(nums), 0) + 1
                kept += 1
            else:
                skipped += 1
                if all_rows:
                    lines.append(f"?? {name} | " + " | ".join(rest))
        # Ragged rows mean the blank-cell handling is still wrong somewhere.
        if len(widths) > 1:
            ragged.append((n, sorted(widths.items(), key=lambda kv: -kv[1])))

    out.write_text("\n".join(lines + item_lines) + "\n")
    print(f"{len(tables)} tables, {kept} data rows kept, {skipped} skipped -> {out}")
    if skipped and not all_rows:
        print("  re-run with --all-rows to see what was skipped before trusting this")
    for n, widths in ragged:
        counts = ", ".join(f"{w} cols x{c}" for w, c in widths)
        print(f"  WARNING table {n}: inconsistent column counts -> {counts}")
    if ragged:
        print("  Ragged rows usually mean merged/spanned cells. Do NOT ingest "
              "until every row in a table has the same width.")


if __name__ == "__main__":
    main()
