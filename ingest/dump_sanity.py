#!/usr/bin/env python3
"""Fifth dumper, for chains publishing their menu from a Sanity dataset.

Usage: dump_sanity.py <slug> [--menu <id>] [--build <item name>]

Burger King serves its whole menu from an undocumented Sanity CDN, queryable
with GROQ. Two things make it worth a dumper of its own rather than a variant
of dump_json.py:

  * The menu is a TREE, not a list. Sections hold items, pickers (one product
    across its sizes) and combos. Querying `*[_type=="item"]` instead returns
    the entire operational CMS -- 979 named documents including "Donation
    Whopper", "Whopper (Offers)", POS-only SKUs and DO NOT USE dummies. Only
    what hangs off the published menu is real: 286 items.
  * Nutrition comes in two forms per item. `nutrition` is the base before any
    topping; `nutritionWithModifiers` is the sandwich as sold. The menu rows
    use the latter, because that is the figure Burger King publishes.

Ingredients are read from ONE named item (--build), not pooled across the
menu, because the portions are per-item: American Cheese is 80 cal on a
Whopper and 40 on a Jr, at 34% and 33% of occurrences with no dominant value.
Averaging them would invent a slice that BK does not serve.

Emits the same raw_dump.txt shape as the other four dumpers.
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent.parent / "data" / "raw"
CHAINS = Path(__file__).parent / "chains"
# Order must match layout.columns in the chain config.
FIELDS = ["weight", "calories", "fat", "saturatedFat", "transFat", "cholesterol",
          "sodium", "carbohydrates", "fiber", "sugar", "proteins"]


def groq(base, dataset, query):
    url = f"{base}/data/query/{dataset}?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(url, headers={"User-Agent": "eatimate-ingest"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())["result"]


def num(v):
    if v is None:
        return "-"
    # The base figure is the chain's own subtraction of the modifiers from the
    # finished item, and rounding takes it under zero: the Whopper base lists
    # -5 mg cholesterol. Below zero is not a measurement, and the parser reads
    # a leading "-" as the not-published token, so clamp it here where the
    # reason is visible rather than letting it shift a whole row of columns.
    if v < 0:
        v = 0
    return f"{v:g}"


def row(name, nut):
    return f"{name} " + " ".join(num((nut or {}).get(f)) for f in FIELDS)


MENU_Q = """*[_id==$menu][0].options[]->{"section":name.en,"children":options[]->{
  _type,"name":name.en,"nut":nutritionWithModifiers,
  "picked":options[]{"it":option->{"name":name.en,"nut":nutritionWithModifiers}}}}"""

BUILD_Q = """*[_type=="item" && name.en==$name && defined(nutritionWithModifiers.calories)][0]{
  "name":name.en,"base":nutrition,"served":nutritionWithModifiers,
  "groups":options[]{"g":name.en,"mods":options[]{
    "mult":modifierMultiplier->multiplier,"pre":modifierMultiplier->prefix.en,"nut":nutrition}}}"""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("--menu", help="menu document id (default: meta.source.menu_id)")
    ap.add_argument("--build", help="item whose modifiers become the build (default: meta.source.build_item)")
    a = ap.parse_args()

    src = json.loads((CHAINS / f"{a.slug}.json").read_text())["meta"]["source"]
    base, dataset = src["api_base"], src["dataset"]
    menu = a.menu or src["menu_id"]
    build_item = a.build or src["build_item"]

    out, seen = [], {}
    tree = groq(base, dataset, MENU_Q.replace("$menu", json.dumps(menu)))
    for sec in tree or []:
        rows = []
        for ch in (sec.get("children") or []):
            if not ch:
                continue
            cands = [(ch.get("name"), ch.get("nut"))]
            cands += [(p["it"].get("name"), p["it"].get("nut"))
                      for p in (ch.get("picked") or []) if p and p.get("it")]
            for name, nut in cands:
                if not name or not nut or nut.get("calories") is None:
                    continue
                # Deduped on name AND values: the same product is listed under
                # several dayparts, and those repeats are identical. A name
                # carrying DIFFERENT values is a different product and is kept,
                # so extract.py sees it and a person decides.
                key = (name.strip(), tuple(nut.get(f) for f in FIELDS))
                if key in seen:
                    continue
                seen[key] = True
                rows.append(row(name.strip(), nut))
        if rows:
            out.append(f"MENU: {sec['section']}")
            out += rows

    b = groq(base, dataset, BUILD_Q.replace("$name", json.dumps(build_item)))
    if not b:
        sys.exit(f"build item {build_item!r} not found")
    out.append(f"BUILD: {b['name']}")
    # The base is the item with nothing on it -- every topping below is a
    # modifier, so this is the bun and what the chain bakes into it.
    out.append(row(f"{b['name']} base", b["base"]))
    for g in (b["groups"] or []):
        one = [m for m in (g.get("mods") or [])
               if m.get("mult") == 1 and m.get("nut") and m["nut"].get("calories") is not None]
        if not one:
            continue  # "Cut In Half", "Plain" -- preparation, not an ingredient
        out.append(row(g["g"], one[0]["nut"]))

    d = RAW / a.slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "raw_dump.txt").write_text("\n".join(out) + "\n")
    print(f"{a.slug}: {len(seen)} menu rows + build from {build_item!r} -> {d/'raw_dump.txt'}")
    print(f"  check: {b['name']} base {b['base'].get('calories')} "
          f"+ its defaults should reach {b['served'].get('calories')} as sold")


if __name__ == "__main__":
    main()
