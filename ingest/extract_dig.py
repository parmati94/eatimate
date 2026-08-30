"""DIG (formerly Dig Inn) — deterministic extraction from the pdfplumber dump.

Layout (Summer 2026, 1 page): every section repeats a header row and rows are
"<name> <serving oz> <10 numbers>" — cols: Calories, Total Fat, Sat Fat, Trans
Fat, Chol, Sodium, Carbs, Fiber, Sugar, Protein. "<1" → 0.5 per runbook.
Serving sizes are weight ounces → serving_g = oz × 28.35.
"""
import json, re, sys
from pathlib import Path

RAW = Path("data/raw/dig/raw_dump.txt")
OUT = Path("data/chains/dig.json")
FIELDS = ["calories","fat_g","sat_fat_g","trans_fat_g","cholesterol_mg","sodium_mg","carbs_g","fiber_g","sugars_g","protein_g"]
NUM = r"(?:<1|\d+(?:\.\d+)?)"
ROW = re.compile(rf"^(?P<name>.+?)\s+(?P<oz>\d+(?:\.\d+)?)\s+(?P<nums>(?:{NUM}\s+){{9}}{NUM})$")

def num(x): return 0.5 if x == "<1" else (int(x) if x.isdigit() else float(x))

rows, section, sub = [], None, None
for line in RAW.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("=====") or "Serving Size (oz)" in line or line.startswith("Last Updated"):
        if line.startswith(("Sides ", "Mains ", "Extras ")): sub = line.split()[0]
        continue
    m = ROW.match(line)
    if m:
        rows.append({"section": section, "sub": sub, "name": m.group("name").strip(), "oz": float(m.group("oz")), "nums": [num(x) for x in m.group("nums").split()]})
    elif line.isupper() and len(line) < 30:
        section, sub = line, None
print(f"parsed {len(rows)} rows", file=sys.stderr)

def slug(s):
    s = s.lower().replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def comp(r, category, name=None, id=None, desc=None, **extra):
    c = {"id": id or slug(r["name"]), "name": name or r["name"], "category": category,
         "serving_desc": desc or f"{r['oz']:g} oz", "serving_g": round(r["oz"] * 28.35)}
    c.update(dict(zip(FIELDS, r["nums"]))); c.update(extra); r["used"] = True
    return c

def zero(id, name, category, desc):
    c = {"id": id, "name": name, "category": category, "serving_desc": desc, "serving_g": None, "synthetic": True}
    c.update({f: 0 for f in FIELDS}); return c

def find(section, name, sub=None):
    for r in rows:
        if r["section"] == section and r["name"] == name and (sub is None or r["sub"] == sub): return r
    raise KeyError((section, name, sub))

components = []
# Build flow — bases are the Market Line rows DIG offers as bowl bases.
BASES = ["Brown Rice", "Herb Rice", "Farm Greens with Mint"]
for b in BASES: components.append(comp(find("MARKET LINE", b, "Sides"), "base", desc=f"{find('MARKET LINE', b, 'Sides')['oz']:g} oz bowl portion"))
for r in rows:
    if r["section"] == "MARKET LINE" and r["sub"] == "Sides" and r["name"] not in BASES:
        components.append(comp(r, "sides", desc=f"{r['oz']:g} oz bowl portion"))
for r in rows:
    if r["section"] == "MARKET LINE" and r["sub"] == "Mains": components.append(comp(r, "mains", desc=f"{r['oz']:g} oz bowl portion"))
for r in rows:
    if r["section"] == "MARKET LINE" and r["sub"] == "Extras": components.append(comp(r, "extras"))
for r in rows:
    if r["section"] == "SAUCES": components.append(comp(r, "sauces"))
# Extras flow — composed items as printed
for sec, cat in [("CHEF'S SPECIALS", "signature"), ("SEASONAL SPECIALS", "signature"), ("ALL DAY DEALS", "signature"), ("SALADS", "signature"), ("LITTLE DIGS", "kids"), ("DESSERTS", "desserts")]:
    for r in rows:
        if r["section"] == sec: components.append(comp(r, cat))

unused = [r["name"] for r in rows if not r.get("used")]
print("UNUSED PDF ROWS:", unused, file=sys.stderr)

chain = {
    "name": "DIG",
    "slug": "dig",
    "source": {"pdf_url": "https://storyblok.pleinaircdn.com/f/274373/x/f847b38fee/dig-nutrition-summer-2026.pdf", "retrieved": "2026-08-30"},
    "disclaimer_extra": "DIG's chart lists single bowl-portion servings (Summer 2026 menu, updated July 9, 2026); a la carte vegetable sides are 1.5 servings. Menu rotates seasonally.",
    "categories": [
        {"id": "base", "name": "Base", "select": "single", "flow": "build"},
        {"id": "sides", "name": "Market Sides", "select": "multi", "flow": "build"},
        {"id": "mains", "name": "Mains", "select": "multi", "flow": "build"},
        {"id": "extras", "name": "Extras", "select": "multi", "flow": "build"},
        {"id": "sauces", "name": "Sauces", "select": "multi", "flow": "build"},
        {"id": "signature", "name": "Bowls, Plates & Salads", "select": "single", "flow": "extras"},
        {"id": "kids", "name": "Little Digs (Kids)", "select": "single", "flow": "extras"},
        {"id": "desserts", "name": "Desserts", "select": "multi", "flow": "extras"},
    ],
    "components": components,
}
OUT.write_text(json.dumps(chain, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {OUT} with {len(components)} components", file=sys.stderr)
