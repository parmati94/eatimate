#!/usr/bin/env python3
"""Sixth dumper, for a menu that publishes INGREDIENTS and composes its items
from them.

Usage: dump_compose.py <slug>

Whataburger's ordering API returns one document holding every ingredient with
its own nutrition and gram weight, plus every recipe as a list of
(ingredient, multiplier). A menu item's nutrition is not published as a row at
all -- it IS the sum, and their own app computes it the same way. Verified
against the numbers Whataburger prints: Whataburger 589.5 against 590, Patty
Melt 941.2 against 941, Monterey Melt 1090.6 against 1090.

Two facts about the encoding, both measured rather than assumed:

  * IT OMITS ZEROS. Across all 268 ingredients and all ten label nutrients
    there is not one explicit 0 -- a tomato simply has no `totalFat` key. So a
    missing field is zero, not "not published", and summing treats it as such.
  * Multipliers are COUNTS of the ingredient's own published unit: a tomato is
    one 15 g slice at 3 cal, and a Whataburger has `tomato x3`. That is why
    the build lists each ingredient once, at one unit, and leaves the count to
    the quantity control -- no averaging over items, unlike a chain that
    publishes a portion per sandwich.

Emits the same raw_dump.txt shape as the other five dumpers.
"""
import argparse
import json
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent.parent / "data" / "raw"
CHAINS = Path(__file__).parent / "chains"
FIELDS = ["weight", "calories", "caloriesFromFat", "totalFat", "saturatedFat",
          "transFat", "cholesterol", "sodium", "carbs", "dietaryFiber",
          "sugars", "protein"]


def fetch(src):
    req = urllib.request.Request(src["api_base"] + src["menu_path"],
                                 headers=src["headers"])
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def walk(recipes, cal):
    """The orderable rows in a recipe tree.

    A node means one of two things and the composition says which. A Monterey
    Melt carries 1090.6 calories of its own, and its children are an a-la-carte
    stub at 0 and a Whatameal bundle with nothing usable -- so the PARENT is the
    item. "Soft Drink" and "Onion Rings" carry nothing of their own and hold the
    sizes underneath -- so the CHILDREN are the items.

    Hence: take the children when any of them composes to something, otherwise
    take the node. Which also drops the tree's dead wood ("invalid fries used
    for offer3", zero at every level) without naming it."""
    out = []
    for r in recipes:
        own = cal(r) or 0
        # A grouping node composes to essentially nothing -- "Soft Drink" is 0,
        # "Tea" is 0.3 from a splash of syrup. Nothing orderable is under 5
        # calories, so that is the line between "this IS the item" and "the
        # items are underneath".
        if own > 5:
            out.append(r)
        else:
            out += walk(r.get("recipes") or [], cal)
    return out


def num(v, weight=False):
    # A zero weight is not a serving size, it is an absent one -- the API's
    # padding entries carry 0 g. The schema requires a positive weight, so emit
    # the not-published token rather than a zero that fails validation later.
    if v is None or (weight and not v):
        return "-"
    return f"{v:g}"


def composer(ing):
    """Calories a recipe composes to, or None if any part lacks them."""
    def calories(r):
        t = 0.0
        for e in (r.get("ingredients") or []):
            n = (ing.get(e["ingredientId"]) or {}).get("nutritionInfo") or {}
            if n.get("calories") is None:
                return None
            t += n["calories"] * e.get("multiplier", 1)
        return t
    return calories


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    a = ap.parse_args()
    cfg = json.loads((CHAINS / f"{a.slug}.json").read_text())
    src = cfg["meta"]["source"]
    d = fetch(src)

    ing = {i["id"]: i for i in d["ingredients"]}
    # Named in config: real parts of a recipe that nobody orders on their own
    # (the seasoned oil the buns are griddled in).
    skip_slugs = {s.lower() for s in src.get("skip_ingredients", [])}
    # Found by weight: the API pads recipes with entries that exist only to add
    # a round number of calories -- "Five-Calories-Increment",
    # "Tortilla-180-Calories" -- and gives them all 0.1 g. Nothing you can eat
    # weighs under a gram, and the schema will not take a zero serving anyway.
    padding = {i["slug"].lower() for i in d["ingredients"]
               if 0 < ((i.get("nutritionInfo") or {}).get("weight") or 0) < 1}
    skip_slugs |= padding
    out, n_ing, n_rec = [], 0, 0

    # Only ingredients a recipe actually uses: the document carries 268, but
    # 200 of them belong to no item on the menu.
    def every(rs):
        for r in rs:
            yield r
            yield from every(r.get("recipes") or [])
    calories = composer(ing)
    used = {e["ingredientId"] for c in d["categories"]
            for r in every(c.get("recipes") or [])
            for e in (r.get("ingredients") or [])}
    out.append("INGREDIENTS")
    for i in sorted(used):
        it = ing.get(i)
        if not it or it["slug"].lower() in skip_slugs:
            continue
        n = it.get("nutritionInfo") or {}
        if n.get("calories") is None:
            continue
        # The slug is the only name the API gives; "iceberg-lettuce" reads as
        # Iceberg Lettuce, which is what the menu calls it.
        name = it["slug"].replace("-", " ").title()
        out.append(name + " " + " ".join(num(n.get(f), f == "weight") for f in FIELDS))
        n_ing += 1

    # Deduped across the WHOLE menu, not per category: a Whataburger is listed
    # under Burgers and again under All-Time Favorites, and two identical rows
    # would mint the same component id twice.
    seen = set()
    for c in d["categories"]:
        if c["name"] in src.get("skip_categories", []):
            continue
        rows = []
        for r in walk(c.get("recipes") or [], calories):
            es = r.get("ingredients") or []
            if not es or not r.get("name"):
                continue
            tot = {f: 0.0 for f in FIELDS}
            whole = True
            for e in es:
                n = (ing.get(e["ingredientId"]) or {}).get("nutritionInfo") or {}
                if n.get("calories") is None:
                    whole = False
                    break
                for f in FIELDS:
                    tot[f] += (n.get(f) or 0) * e.get("multiplier", 1)
            if not whole:
                continue  # a bundle pointing at other recipes, not an item
            # A recipe built only from ingredients we skip is a placeholder,
            # not an item: several appear as their real name against 10 cal of
            # the API's "Five-Calories-Increment" padding entry.
            if all(ing[e["ingredientId"]]["slug"].lower() in skip_slugs for e in es):
                continue
            rows.append(r["name"].strip() + " " +
                        " ".join(num(round(tot[f], 2), f == "weight") for f in FIELDS))
        uniq = []
        for row in rows:
            if row in seen:
                continue
            seen.add(row)
            uniq.append(row)
        if uniq:
            out.append("MENU: " + c["name"])
            out += uniq
            n_rec += len(uniq)

    dst = RAW / a.slug
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "raw_dump.txt").write_text("\n".join(out) + "\n")
    print(f"{a.slug}: {n_ing} ingredients + {n_rec} composed items -> {dst/'raw_dump.txt'}")


if __name__ == "__main__":
    main()
