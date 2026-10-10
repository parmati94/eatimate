#!/usr/bin/env python3
"""Seventh dumper, for chains whose nutrition page embeds an EveryBite widget.

Usage: dump_everybite.py <slug> [--widget <id>]

The widget (app.everybite.com/widget/<id>) is filled from a public GraphQL
endpoint, and `dishesByWidget` returns every dish with its full nutrient panel
as the chain published it. bartaco is the first; Playa Bowls and Cracker Barrel
embed the same widget, so this is written for the widget, not for one chain.

Two things the payload does that the rest of the pipeline must not inherit:

  * It is the chain's whole recipe database, not its current menu. bartaco's
    still carries retired tacos and rows literally named "... - Duplicate".
    Rows are emitted as published; deciding which are on the menu is the
    config's job, so a new dish fails extract.py instead of slipping in.
  * Each dish also lists its USDA-matched ingredients with gram weights.
    Ignored: the published dish total is the chain's figure, and those
    ingredient rows are EveryBite's working, not something the menu sells.

Emits the same raw_dump.txt shape as the other dumpers.
"""
import argparse
import json
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent.parent / "data" / "raw"
CHAINS = Path(__file__).parent / "chains"
API = "https://internal-api.everybite.com/graphql"
# Order must match layout.columns in the chain config.
FIELDS = ["caloriesTotal", "fatTotal", "fatSaturated", "fatTrans", "cholesterol",
          "sodium", "carbohydrates", "dietaryFiber", "sugar", "protein"]

QUERY = """{ dishesByWidget(id: %s, take: 1000) { count data { dish {
  name dishOrdinal category { name } nutrients { %s } } } } }"""


def fetch(widget):
    body = json.dumps({"query": QUERY % (json.dumps(widget), " ".join(FIELDS))}).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Content-Type": "application/json", "User-Agent": "eatimate-ingest"})
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read())
    if d.get("errors"):
        raise SystemExit(f"everybite error: {d['errors'][0].get('message')}")
    res = d["data"]["dishesByWidget"]
    dishes = [m["dish"] for m in res["data"]]
    # `take` is a page size; a short page would drop dishes without a word.
    if len(dishes) != res["count"]:
        raise SystemExit(f"got {len(dishes)} of {res['count']} dishes; raise take")
    return dishes


def num(v):
    return "-" if v is None or str(v).strip() == "" else f"{float(v):g}"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("--widget", help="widget id (default: meta.source.widget_id)")
    a = ap.parse_args()

    src = json.loads((CHAINS / f"{a.slug}.json").read_text())["meta"]["source"]
    dishes = fetch(a.widget or src["widget_id"])

    # Sorted, because the API's order is not a promise and the dump must be
    # byte-identical for an unchanged menu.
    by_cat = {}
    for d in dishes:
        by_cat.setdefault(d["category"]["name"].strip(), []).append(d)
    out = []
    for cat in sorted(by_cat):
        out.append(f"SECTION: {cat}")
        for d in sorted(by_cat[cat], key=lambda d: (d.get("dishOrdinal") or 0, d["name"])):
            name = " ".join(d["name"].split())
            out.append(f"{name} " + " ".join(num(d["nutrients"].get(f)) for f in FIELDS))

    dst = RAW / a.slug
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "raw_dump.txt").write_text("\n".join(out) + "\n")
    print(f"{a.slug}: {len(dishes)} dishes in {len(by_cat)} categories -> {dst / 'raw_dump.txt'}")


if __name__ == "__main__":
    main()
