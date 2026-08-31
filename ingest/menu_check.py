"""Compare a chain's live menu against what we ingested.

Usage: menu_check.py <slug> [--json] [--emit]

`refresh.py` answers "has the source document changed?". This answers the
question a document cannot: "is the chain selling something we do not have?"
Chipotle's printed chart is dated March 2025 and its live menu carries seven
proteins and sauces that postdate it, so the document alone would leave the
calculator unable to build half of what people order.

Reports, never writes. --emit prints a ready-made `derived` config block for
the new items, with "cat" left empty: the figures are mechanical, but what
category an item belongs to is a judgement no menu API can make, and filling
it in with a guess is how a sauce silently becomes a side.

Driven by `meta.menu_check` in the chain config:

    "menu_check": {
      "items_url":  endpoint carrying nutrition, keyed by item id
      "names_url":  endpoint carrying itemId/itemName pairs
      "headers":    e.g. the public subscription key the chain's own site sends
      "nutrition":  short code -> our field name
      "ignore":     regex for rows that are not ingredients (composed items,
                    bottled drinks, "Extra"/"Half" portions, "No Beans")
      "aliases":    live-menu name -> the name we already hold, for items the
                    two documents spell differently ("Brown Rice" on the menu
                    is "Cilantro-Lime Brown Rice" on the chart)
    }
"""
import json, re, sys, unicodedata, warnings
from pathlib import Path

warnings.filterwarnings("ignore")
CHAINS = Path(__file__).parent / "chains"
DATA = Path(__file__).parent.parent / "data" / "chains"


def norm(s):
    """Loose match: menus and charts rarely spell an item the same way."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(side of|large|regular|extra|order of)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def collect_names(obj, out):
    if isinstance(obj, dict):
        i, n = obj.get("itemId"), obj.get("itemName")
        if i and n:
            out.setdefault(i, n)
        for v in obj.values():
            collect_names(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_names(v, out)


def check(slug):
    import requests
    cfg = json.loads((CHAINS / f"{slug}.json").read_text())
    spec = cfg["meta"].get("menu_check")
    if not spec:
        return {"chain": slug, "state": "unsupported",
                "note": "no meta.menu_check in the config"}
    h = dict(spec.get("headers", {}))
    h.setdefault("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                               "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")
    try:
        items = requests.get(spec["items_url"], headers=h, timeout=60).json()["items"]
        names = {}
        collect_names(requests.get(spec["names_url"], headers=h, timeout=60).json(), names)
    except Exception as e:
        return {"chain": slug, "state": "error", "note": f"{type(e).__name__}: {e}"}

    ours = {norm(c["name"]) for c in json.loads((DATA / f"{slug}.json").read_text())["components"]}
    ignore = re.compile(spec["ignore"], re.I) if spec.get("ignore") else None
    alias = {norm(k): norm(v) for k, v in (spec.get("aliases") or {}).items()}
    fields = spec.get("nutrition", {})
    new, seen = [], set()
    for iid, it in items.items():
        name = names.get(iid)
        if not name or (ignore and ignore.search(name)):
            continue
        key = alias.get(norm(name), norm(name))
        if key in ours or key in seen:
            continue
        seen.add(key)
        n = it.get("nutrition") or {}
        p = it.get("portion") or {}
        new.append({"name": name,
                    "portion": f"{p.get('value','?')} {p.get('unit','')}".strip(),
                    **{ours_f: n.get(code) for code, ours_f in fields.items()}})
    return {"chain": slug, "state": "new items" if new else "ok",
            "count": len(new), "items": sorted(new, key=lambda r: r["name"])}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    r = check(args[0])
    if "--emit" in sys.argv:
        block = [{
            "id": re.sub(r"[^a-z0-9]+", "-", i["name"].lower()).strip("-"),
            "name": i["name"], "cat": "", "serving_desc": i["portion"],
            "values": {k: v for k, v in i.items() if k not in ("name", "portion")},
        } for i in r.get("items", [])]
        print(json.dumps(block, indent=1, ensure_ascii=False))
    elif "--json" in sys.argv:
        print(json.dumps(r, indent=1))
    elif r["state"] in ("error", "unsupported"):
        print(f"  {r['chain']}: {r['state'].upper()} — {r['note']}")
    elif not r["count"]:
        print(f"  {r['chain']}: menu matches what we hold")
    else:
        print(f"  {r['chain']}: {r['count']} item(s) on the live menu we do not have\n")
        for i in r["items"]:
            vals = " ".join(f"{k}={v}" for k, v in i.items() if k not in ("name", "portion"))
            print(f"    {i['name'][:36]:38} {i['portion']:>10}  {vals}")
    sys.exit(1 if r["state"] in ("new items", "error") else 0)


if __name__ == "__main__":
    main()
