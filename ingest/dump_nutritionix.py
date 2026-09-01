#!/usr/bin/env python3
"""Fourth dumper: a Nutritionix restaurant export (items/groups/modifiers).

Usage: dump_nutritionix.py <slug> [file.json] [--groups]

Several chains hand their nutrition to Nutritionix and embed the calculator;
the export it renders from is one JSON document shaped:

    items[]      the named menu products. Their totals live in calculated*
                 fields -- `calories` is 0 on every one of them and means
                 nothing; `calculatedCalories` is the real figure, summed by
                 Nutritionix over the item's ingredients.
    templates[]  {items: [item ids], groups: [{id, multiplier}]} -- which groups
                 of modifiers apply to which products.
    groups[]     {name, multipleSelect, portions[], modifiers[{id}]}
    modifiers[]  the ingredients, each with a full nutrition dict.

Both halves are emitted as sections of the same raw_dump.txt every other dumper
produces: menu categories carry the named products, modifier groups carry the
ingredients you add to one. Portions (Light 0.5x / Regular 1x / Double 2x) are
multipliers the chain states itself, so they need no rows -- they are the
builder's existing quantity steps.

--groups   list the groups with their sizes and portions, and exit. Run this
           FIRST: the names it prints are the section keys for the config.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Nutritionix's field names, in the order layout.columns must be written.
FIELDS = [
    ("calories", "calories"), ("fatCalories", "cff"), ("totalFat", "fat_g"),
    ("saturatedFat", "sat_fat_g"), ("transFat", "trans_fat_g"),
    ("cholesterol", "cholesterol_mg"), ("sodium", "sodium_mg"),
    ("totalCarb", "carbs_g"), ("fiber", "fiber_g"), ("sugars", "sugars_g"),
    ("protein", "protein_g"),
]


def clean(s: str) -> str:
    """&reg; and friends survive the export; ids and names are cleaner without."""
    s = re.sub(r"&(reg|trade|amp|nbsp);", lambda m: {"amp": "&"}.get(m.group(1), ""), s)
    return re.sub(r"\s+", " ", s).strip()


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else round(f, 2)


def main() -> None:
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("slug")
    ap.add_argument("path", nargs="?")
    ap.add_argument("--groups", action="store_true")
    if len(sys.argv) == 1 or "-h" in sys.argv or "--help" in sys.argv:
        sys.exit(__doc__)
    a = ap.parse_args()

    raw = Path(a.slug if a.path is None else "").name  # placeholder, resolved below
    src = Path(a.path) if a.path else None
    if src is None:
        cands = sorted(Path(f"data/raw/{a.slug}").glob("*menu-latest*.json")) or \
                sorted(Path(f"data/raw/{a.slug}").glob("*.json"))
        if not cands:
            sys.exit(f"no json found in data/raw/{a.slug}/ -- pass one explicitly")
        src = max(cands, key=lambda p: p.stat().st_size)
    doc = json.loads(src.read_text())

    groups = {g["id"]: g for g in doc["groups"]}
    mods = {m["id"]: m for m in doc["modifiers"]}
    used = []
    for t in doc.get("templates", []):
        for e in t.get("groups", []):
            if e["id"] not in used:
                used.append(e["id"])

    if a.groups:
        print(f"  {src}  ({len(used)} groups reachable from a template)\n")
        for gid in used:
            g = groups.get(gid)
            if not g:
                continue
            rows = [mods[e["id"]] for e in g.get("modifiers", [])
                    if e["id"] in mods
                    and isinstance(mods[e["id"]].get("nutrition", {}).get("calories"), (int, float))]
            if not rows:
                continue
            ports = [p["name"] for p in (g.get("portions") or []) if p.get("active")]
            sel = "multi" if g.get("multipleSelect") else "single"
            print(f"  {clean(g['name'])[:42]:44} {len(rows):>3} rows  {sel:6} {'/'.join(ports)}")
        return

    out, kept = [], 0

    # Named products first: one section per menu category. These read from
    # calculated* because the plain fields are zero on every item.
    items = {i["id"]: i for i in doc["items"]}
    for cat in doc.get("categories", []):
        lines = []
        for iid in cat.get("items", []):
            it = items.get(iid if isinstance(iid, int) else iid.get("id"))
            if not it:
                continue
            n = it.get("nutrition") or {}
            cells = [num(n.get("calculated" + src_[0].upper() + src_[1:])) for src_, _ in FIELDS]
            if not cells[0]:
                continue
            cells = [c if c is not None else 0 for c in cells]
            lines.append(f"{clean(it['name'])} " + " ".join(f"{c:g}" for c in cells))
        if lines:
            out.append(f"MENU: {clean(cat['name'])}")
            out.extend(lines)
            kept += len(lines)

    for gid in used:
        g = groups.get(gid)
        if not g:
            continue
        lines = []
        for e in g.get("modifiers", []):
            m = mods.get(e["id"])
            if not m:
                continue
            n = m.get("nutrition") or {}
            if not isinstance(n.get("calories"), (int, float)):
                continue
            # A modifier's nutrition is stated ONCE at a reference portion; the
            # group scales it for that sandwich size. Capicola is one record,
            # served x1.5 on a BIGS and x0.667 on a Skinny, and a 30 fl oz Coke
            # is the 22 fl oz record x1.364. Ignore this and 64 of 80 groups
            # report the wrong figure.
            k = e.get("multiplier", 1) or 1
            cells = [num((n.get(src_) or 0) * k) for src_, _ in FIELDS]
            if any(c is None for c in cells):
                continue
            lines.append(f"{clean(m['name'])} " + " ".join(f"{c:g}" for c in cells))
        if lines:
            out.append(clean(g["name"]))
            out.extend(lines)
            kept += len(lines)

    dest = Path(f"data/raw/{a.slug}/raw_dump.txt")
    dest.write_text("\n".join(out) + "\n")
    print(f"  {len(out) - kept} sections, {kept} rows -> {dest}")
    print(f"  columns: {' '.join(c for _, c in FIELDS)}")


if __name__ == "__main__":
    main()
