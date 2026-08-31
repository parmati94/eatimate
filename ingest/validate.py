"""Sanity-validate a chain JSON per ingest/README.md. Usage: validate.py data/chains/<slug>.json
Hard errors (exit 1): negatives, duplicate ids, unknown category, missing fields.
Flags (printed): energy math off by > max(25% of calories, 20 kcal).
"""
import json, sys
from pathlib import Path
FIELDS = ["calories","fat_g","sat_fat_g","trans_fat_g","cholesterol_mg","sodium_mg","carbs_g","fiber_g","sugars_g","protein_g"]
d = json.load(open(sys.argv[1]))
# The energy check assumes calories come from protein/carbs/fat. Alcohol is
# 7 kcal/g and is not one of the label nutrients, so a chain may declare
# categories where the check does not apply (with a reason) in its config.
cfg_path = Path(__file__).parent / "chains" / f"{d['slug']}.json"
exempt = {}
if cfg_path.exists():
    exempt = json.load(open(cfg_path)).get("energy_exempt", {})
errors, flags = [], []
skipped = 0
cats = {c["id"] for c in d["categories"]}
ids = set()
for c in d["components"]:
    if c["id"] in ids: errors.append(f"duplicate id {c['id']}")
    ids.add(c["id"])
    if c["category"] not in cats: errors.append(f"{c['id']}: unknown category {c['category']}")
    for f in FIELDS:
        if f not in c: errors.append(f"{c['id']}: missing {f}")
        elif c[f] < 0: errors.append(f"{c['id']}: negative {f}")
    if c.get("synthetic"): continue
    est = 4*(c["protein_g"]+c["carbs_g"]) + 9*c["fat_g"]
    tol = max(0.25*c["calories"], 20)
    if c["category"] in exempt:
        skipped += 1
    elif abs(est - c["calories"]) > tol:
        flags.append(f"{c['id']}: printed {c['calories']} kcal vs macro estimate {est:.0f} (fat {c['fat_g']} carb {c['carbs_g']} prot {c['protein_g']})")
    if c["sat_fat_g"] + c["trans_fat_g"] > c["fat_g"] + 0.51: flags.append(f"{c['id']}: sat+trans fat > total fat")
    if c["fiber_g"] + c["sugars_g"] > c["carbs_g"] + 1.01: flags.append(f"{c['id']}: fiber+sugar > carbs")
seen = {}
for c in d["components"]:
    key = (c["category"], c["name"])
    for other in seen.get(key, []):
        am, bm = c.get("only_modes"), other.get("only_modes")
        # Size variants share a name on purpose -- they render as one row with a
        # selector. Only flag names that would actually appear twice in a list.
        head_c = c.get("variant_of") or c["id"]
        head_o = other.get("variant_of") or other["id"]
        if head_c == head_o:
            continue
        if not am or not bm or set(am) & set(bm):
            flags.append(f"duplicate visible name {key}: {other['id']} vs {c['id']}")
    seen.setdefault(key, []).append(c)
by_cat = {}
for c in d["components"]: by_cat[c["category"]] = by_cat.get(c["category"], 0) + 1
print(f"{d['slug']}: {len(d['components'])} components, {sum(1 for c in d['components'] if c.get('synthetic'))} synthetic")
for cat in d["categories"]: print(f"  {cat['id']:<16} {by_cat.get(cat['id'],0):>3}  ({cat['select']}, {cat.get('flow','build')})")
# What SHAPE will this chain render as? Nothing declares that directly -- the
# builder adapts to whichever capabilities the data uses -- so spell it out
# here rather than leaving it to be inferred by reading the UI code.
shape = []
if any(c.get("flow") == "preset" for c in d["categories"]):
    shape.append("preset fork (menu item or build your own)")
if d.get("size_modes"):
    shape.append(f"format-first ({len(d['size_modes'])} size modes)")
if any(c.get("feature") for c in d["components"]):
    shape.append("make-it-a-meal step")
fams = {c["variant_of"] for c in d["components"] if c.get("variant_of")}
if fams:
    shape.append(f"{len(fams)} size-selector families")
singles = [c["name"] for c in d["categories"] if c["select"] == "single"]
if singles:
    shape.append("exclusive: " + ", ".join(singles))
print("  presentation:", "; ".join(shape) if shape else "plain ingredient list")
for cat, why in exempt.items():
    print(f"  energy check not applied to {cat}: {why}")
for f in flags: print("FLAG:", f)
for e in errors: print("ERROR:", e)
sys.exit(1 if errors else 0)
