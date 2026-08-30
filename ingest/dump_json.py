"""Usage: dump_json.py <slug> [url|file] [--group menu] [--items items] [--labels]

Third dumper, for chains that publish nutrition as structured JSON rather than
a PDF (dump.py) or an HTML table (dump_html.py) -- Chick-fil-A embeds it in the
page; several chains serve it from an ordering API. Emits the SAME
raw_dump.txt shape as the other two, so ingest/chains/<slug>.json column specs
and common.py work unchanged.

Expects groups shaped like:
    {"<group>": "Sandwich Toppings", "<items>": [
        {"title": "American Cheese",
         "fields": [{"label": "Calories", "value": 50}, ...]}]}

The JSON may be embedded anywhere in an HTML page; arrays are located by key
and read with a brace-matching scan, so no HTML parsing is involved.

--labels   print the field-label order and exit. Run this FIRST: the order it
           prints is the order layout.columns must be written in.

With no source argument, reads meta.source.html_url (or json_url / pdf_url)
from ingest/chains/<slug>.json.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}


def load(src):
    if src.startswith(("http://", "https://")):
        r = requests.get(src, headers=HEADERS, timeout=90)
        r.raise_for_status()
        return r.text
    return Path(src).read_text(encoding="utf-8", errors="replace")


def config_source(slug):
    """(url, groups) from the chain's own config, so a refresh needs no flags."""
    cfg = Path(f"ingest/chains/{slug}.json")
    if not cfg.exists():
        sys.exit(f"error: no source given and {cfg} does not exist")
    src = json.loads(cfg.read_text()).get("meta", {}).get("source", {})
    url = src.get("json_url") or src.get("html_url") or src.get("pdf_url")
    if not url:
        sys.exit(f"error: {cfg} has no meta.source url to fetch")
    print(f"source from config: {url}")
    return url, src.get("groups")


def match_array(s, start):
    """Text of the JSON array beginning at s[start] == '['."""
    depth, k, instr, esc = 0, start, False, False
    while k < len(s):
        c = s[k]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
        elif c == '"':
            instr = True
        elif c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                return s[start:k + 1]
        k += 1
    return None


def groups(text, group_key, items_key):
    """[(group_name, [record, ...])] in document order, de-duplicated.

    Pages often render the same data more than once (desktop/mobile/print),
    so a group name already seen is skipped rather than emitted twice.
    """
    out, seen = [], set()
    for m in re.finditer(rf'"{re.escape(items_key)}"\s*:\s*\[', text):
        arr_txt = match_array(text, text.index("[", m.start()))
        if not arr_txt:
            continue
        try:
            arr = json.loads(arr_txt)
        except json.JSONDecodeError:
            continue
        if not arr or not isinstance(arr[0], dict) or "fields" not in arr[0]:
            continue
        back = text[max(0, m.start() - 300):m.start()]
        names = re.findall(rf'"{re.escape(group_key)}"\s*:\s*"([^"]{{1,80}})"', back)
        name = names[-1] if names else "UNGROUPED"
        if name in seen:
            continue
        seen.add(name)
        out.append((name, arr))
    return out


def value(v):
    """Field values arrive as numbers, or strings like '21g' / '< 1'."""
    if isinstance(v, (int, float)):
        return f"{v:g}"
    s = str(v).strip()
    s = re.sub(r"(?<=\d)\s*(g|mg|oz|kcal|cal)\b", "", s, flags=re.I).strip()
    s = s.replace("< 1", "<1")
    return s if s else "-"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("source", nargs="?")
    ap.add_argument("--group", default="menu", help="key naming each group (default: menu)")
    ap.add_argument("--items", default="items", help="key holding each group's records")
    ap.add_argument("--labels", action="store_true", help="print field-label order and exit")
    ap.add_argument("--groups", nargs="*", default=None,
                    help="only these groups (default: meta.source.groups, else all)")
    a = ap.parse_args()

    want = a.groups
    if a.source:
        text = load(a.source)
    else:
        url, cfg_groups = config_source(a.slug)
        text = load(url)
        if want is None:
            want = cfg_groups

    gs = groups(text, a.group, a.items)
    if not gs:
        sys.exit(f"error: no '{a.items}' arrays with a 'fields' list found")
    if want:
        have = {n for n, _ in gs}
        missing = [w for w in want if w not in have]
        if missing:
            # A renamed group must fail loudly, not silently vanish from the data.
            sys.exit(f"error: requested groups not present: {missing}\n"
                     f"       available: {sorted(have)}")
        gs = [(n, r) for n, r in gs if n in set(want)]

    if a.labels:
        labels = [f.get("label") for f in gs[0][1][0]["fields"]]
        print(f"{len(gs)} groups, {sum(len(x[1]) for x in gs)} records")
        print("\nfield order (write layout.columns to match):")
        for i, l in enumerate(labels, 1):
            print(f"  {i:>2}. {l}")
        return

    lines, n = [], 0
    for name, records in gs:
        lines.append(f"\n===== {name} =====")
        lines.append(name)
        for rec in records:
            for r in [rec] + (rec.get("sub_items") or []):
                title = re.sub(r"\s+", " ", str(r.get("title", ""))).strip()
                vals = [value(f.get("value")) for f in r.get("fields", [])]
                if title and vals:
                    lines.append(f"{title} {' '.join(vals)}")
                    n += 1

    out = Path(f"data/raw/{a.slug}/raw_dump.txt")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n")
    print(f"{len(gs)} groups, {n} records -> {out}")
    widths = {}
    for l in lines:
        if l.startswith("=====") or not l.strip():
            continue
        parts = l.split()
        k = sum(1 for p in parts if re.fullmatch(r"-|<1|\d+(?:\.\d+)?", p))
        if k:
            widths[k] = widths.get(k, 0) + 1
    if len(widths) > 1:
        top = sorted(widths.items(), key=lambda kv: -kv[1])
        print("  WARNING inconsistent value counts -> " +
              ", ".join(f"{w} vals x{c}" for w, c in top))


if __name__ == "__main__":
    main()
