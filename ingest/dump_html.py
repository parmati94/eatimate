"""Usage: dump_html.py <slug> [url|file.html] [--min-nums N] [--all-rows]

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


def load(src):
    if src.startswith(("http://", "https://")):
        r = requests.get(src, headers=BROWSER_HEADERS, timeout=60)
        r.raise_for_status()
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
    url = source.get("html_url") or source.get("pdf_url") or source.get("url")
    if not url:
        sys.exit(f"error: {cfg} has no meta.source.html_url/pdf_url to fetch")
    print(f"source from config: {url}")
    return url


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


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    slug = args[0]
    # Re-ingest ergonomics: with no source given, read it from the chain's own
    # config so refreshing a chain is just `dump_html.py <slug>` -- no URL to
    # remember, and one place to update when a chain moves its page.
    src = args[1] if len(args) > 1 else config_source(slug)
    min_nums = 4
    if "--min-nums" in sys.argv:
        min_nums = int(sys.argv[sys.argv.index("--min-nums") + 1])
    all_rows = "--all-rows" in sys.argv

    soup = BeautifulSoup(load(src), "lxml")
    for junk in soup(["script", "style", "noscript"]):
        junk.decompose()

    out = Path(f"data/raw/{slug}/raw_dump.txt")
    out.parent.mkdir(parents=True, exist_ok=True)

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

    out.write_text("\n".join(lines) + "\n")
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
