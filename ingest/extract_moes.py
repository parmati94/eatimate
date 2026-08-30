"""Moe's Southwest Grill — deterministic extraction from the pdfplumber dump.

Layout (2026 PDF): 10 numeric columns, no serving grams:
  CALS FAT SATFAT TRANSFAT CHOL SOD CARB FIBER SUGAR PROT
Rows are "<name> <10 numbers>"; a few names wrap onto a following line with
no numbers (we append that text to the previous row's serving note).
"""
import json, re, sys
from pathlib import Path

RAW = Path("data/raw/moes/raw_dump.txt")
OUT = Path("data/chains/moes.json")
FIELDS = ["calories","fat_g","sat_fat_g","trans_fat_g","cholesterol_mg","sodium_mg","carbs_g","fiber_g","sugars_g","protein_g"]
ROW = re.compile(r"^(?P<name>.+?)\s+(?P<nums>(?:\d+(?:\.\d+)?\s+){9}\d+(?:\.\d+)?)$")
SECTION = re.compile(r"^[A-Z0-9 ’'&/,-]+$")

rows = []  # (section, name, nums, note)
section = None
for line in RAW.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("=====") or line.startswith("PAGE ") or line.startswith("INGREDIENTS ") or line.startswith("(KCAL)"):
        continue
    if line.startswith("PROTEINS SSMM") or line.startswith("OFFERINGS") or line.startswith("AL CONTENT") or line.startswith("FROM TIME") or line.startswith("PLEASE NOTE") or line.startswith("ALLERGENS AND") or line.startswith("ES. IF YOU"):
        continue
    m = ROW.match(line)
    if m:
        nums = [float(x) for x in m.group("nums").split()]
        rows.append([section, m.group("name").strip(), nums, ""])
    elif SECTION.match(line) and len(line) < 40:
        section = line
    else:
        # wrapped continuation of previous row's name
        if rows:
            rows[-1][3] = (rows[-1][3] + " " + line).strip()
        else:
            print("UNPARSED:", line, file=sys.stderr)

print(f"parsed {len(rows)} rows", file=sys.stderr)

def slug(s):
    s = s.lower().replace("’", "").replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def comp(id, name, category, serving_desc, nums, **extra):
    c = {"id": id, "name": name, "category": category, "serving_desc": serving_desc, "serving_g": None}
    c.update(dict(zip(FIELDS, [int(n) if float(n).is_integer() else n for n in nums])))
    c.update(extra)
    return c

def zero(id, name, category, serving_desc):
    return comp(id, name, category, serving_desc, [0]*10, synthetic=True)

by = {(r[0], r[1]): r for r in rows}
def get(section, name):
    r = by[(section, name)]
    r.append("used")
    return r

components = []

# ---- Base / format (single). PDF has tortillas & shells under FRESH INGREDIENTS.
components += [
    zero("bowl", "Burrito Bowl (no tortilla)", "base", "1 bowl"),
    zero("salad", "Salad (no shell)", "base", "1 salad"),
    comp("tortilla-12", '12" Flour Tortilla', "base", "burrito / quesadilla", get("FRESH INGREDIENTS", "12” Flour Tortilla")[2]),
    comp("tortilla-8", '8" Flour Tortilla', "base", "Jr. burrito", get("FRESH INGREDIENTS", "8” Flour Tortilla")[2]),
    comp("tortilla-6", '6" Flour Tortilla', "base", "1 taco", get("FRESH INGREDIENTS", "6” Flour Tortilla")[2]),
    comp("crispy-corn-shell", '6" Crispy Corn Tortilla / Stack Shell', "base", "1 shell", get("FRESH INGREDIENTS", "6” Crispy Corn Tortilla/Stack Shell")[2]),
]

# ---- Rice (single): portion rows as printed
for rice, sec in [("Seasoned Rice", "SEASONED RICE"), ("Cilantro Lime Rice", "CILANTRO LIME RICE")]:
    s = slug(rice)
    components += [
        comp(f"{s}-burrito", rice, "rice", "burrito portion", get(sec, f"{rice}, Ingredient for Burrito")[2]),
        comp(f"{s}-bowl", rice, "rice", "burrito bowl portion (= cup)", get(sec, f"{rice}, Cup and Burrito Bowl")[2]),
        comp(f"{s}-jr", rice, "rice", "Jr. burrito portion", get(sec, f"{rice}, Ingredient for Jr. Burrito")[2]),
    ]

# ---- Beans (single)
for bean, sec in [("Black Beans", "BLACK BEANS"), ("Pinto Beans", "PINTO BEANS")]:
    s = slug(bean)
    components += [
        comp(f"{s}", bean, "beans", "burrito / bowl / nacho / quesadilla / stack portion", get(sec, f"{bean}, Ingredient portion for Burrito," if bean=="Black Beans" else f"{bean}, Ingredient for Burrito, Bowl,")[2]),
        comp(f"{s}-jr", bean, "beans", "Jr. / taco portion", get(sec, f"{bean} Jr. Ingredient portion/taco fresh")[2]),
    ]

# ---- Proteins (multi so double-ups of different proteins work). Medium row is
# verbatim; PDF Small = ½× and Double = 2× of Medium exactly (checked in report).
for prot in ["Adobo Chicken", "White Meat Chicken", "Hand Cut Steak", "Ground Beef", "Tofu"]:
    components.append(comp(slug(prot), prot, "proteins", "medium portion (burrito, bowl, salad, nachos) · ½× = taco/kids · 2× = double", get("PROTEINS", f"{prot}, Medium")[2]))
    # mark the small/double rows as consumed (represented by multipliers)
    for sz in ["Small", "Double" if prot != "Tofu" else "Large"]:
        get("PROTEINS", f"{prot}, {sz}")

# ---- Queso & guac add-ons (multi)
components += [
    comp("queso-add-on", "Queso (add-on)", "queso-guac", "regular add-on", get("QUESO", "Queso, Add-On")[2]),
    comp("queso-add-on-small", "Queso (add-on, small)", "queso-guac", "taco / kids add-on", get("QUESO", "Queso, Add-On, Small")[2]),
    comp("guac-add-on", "Guac (add-on)", "queso-guac", "regular add-on", get("GUAC", "Guac, Add-On")[2]),
    comp("guac-add-on-small", "Guac (add-on, small)", "queso-guac", "taco / kids add-on", get("GUAC", "Guac, Add-On, Small")[2]),
]

# ---- Sauces & salsas (multi)
SAUCES = {"Moe’s Sauce": "Moe's Sauce", "Poblano Crema": None, "Chili Lime Sauce": None, "Hard Rock": "Hard Rock Sauce", "Chipotle Ranch": None, "SW Vin": "Southwest Vinaigrette", "House-Made Salsa": None, "Tomatillo Salsa": None, "Spicy Red Salsa": None}
for printed, display in SAUCES.items():
    components.append(comp(slug(printed), display or printed, "sauces-salsas", "1 portion", get("FRESH INGREDIENTS", printed)[2]))

# ---- Toppings (multi)
TOPPINGS = ["Grilled Onions and Peppers", "Roasted Corn Salsa", "Oaxaca Cheese", "New Pico", "Guac", "Sour Cream", "Romaine Lettuce", "Onions, Diced", "Jalapenos, Pickled", "Jalapenos, Fresh", "Black Olives", "Bacon", "Potatoes", "Tortilla Chips"]
for t in TOPPINGS:
    name = {"Onions, Diced": "Diced Onions", "Jalapenos, Pickled": "Pickled Jalapeños", "Jalapenos, Fresh": "Fresh Jalapeños", "Guac": "Guac (ingredient portion)", "New Pico": "Pico de Gallo (New Pico)"}.get(t, t)
    components.append(comp(slug(t), name, "toppings", "1 portion", get("FRESH INGREDIENTS", t)[2]))

# ---- Sides (extras, multi)
for item, sec in [("Tortilla Chips", "TORTILLA CHIPS"), ("Queso", "QUESO"), ("Guac", "GUAC")]:
    for size in ["Side", "Cup", "Bowl"]:
        components.append(comp(f"{slug(item)}-{size.lower()}", f"{item}, {size}", "sides", f"{size.lower()} size", get(sec, f"{item}, {size}")[2]))
for rice, sec in [("Seasoned Rice", "SEASONED RICE"), ("Cilantro Lime Rice", "CILANTRO LIME RICE")]:
    components.append(comp(f"{slug(rice)}-side-bowl", f"{rice}, Bowl", "sides", "side bowl", get(sec, f"{rice}, Bowl")[2]))
for bean, sec in [("Black Beans", "BLACK BEANS"), ("Pinto Beans", "PINTO BEANS")]:
    components.append(comp(f"{slug(bean)}-cup", f"{bean}, Cup", "sides", "side cup", get(sec, f"{bean}, Cup")[2]))
    components.append(comp(f"{slug(bean)}-side-bowl", f"{bean}, Bowl", "sides", "side bowl", get(sec, f"{bean}, Bowl")[2]))

# ---- Desserts
components.append(comp("chocolate-chunk-cookie", "Chocolate Chunk Cookie", "desserts", "1 cookie", get("FRESH INGREDIENTS", "Chocolate Chunk Cookie")[2]))

# ---- Drinks (single)
components.append(zero("water", "Water", "drinks", "any size"))
for r in rows:
    if r[0] == "DRINKS":
        name, size = r[1].rsplit(", ", 1)
        components.append(comp(f"{slug(name)}-{size.lower()}", f"{name} ({size})", "drinks", f"{size.lower()} fountain", get("DRINKS", r[1])[2]))

unused = [r[1] for r in rows if r[-1] != "used"]
print("UNUSED PDF ROWS:", unused, file=sys.stderr)

chain = {
    "name": "Moe's Southwest Grill",
    "slug": "moes",
    "source": {"pdf_url": "https://assets.ctfassets.net/zqt8tllj2cy0/229Bgcvw5c0RwcUkhyghXG/d3722a14b4b1dd925316a8936200f5bd/MOES_1906368_Nutrition_Chart_2026_R4.pdf", "retrieved": "2026-08-30"},
    "disclaimer_extra": "Moe's publishes no serving weights; portions are as named on their chart. Protein portions: the chart's Small (tacos/kids) and Double rows are exactly ½× and 2× of the Medium row shown here.",
    "categories": [
        {"id": "base", "name": "Base / Format", "select": "single", "flow": "build"},
        {"id": "rice", "name": "Rice", "select": "single", "flow": "build"},
        {"id": "beans", "name": "Beans", "select": "single", "flow": "build"},
        {"id": "proteins", "name": "Proteins", "select": "multi", "flow": "build"},
        {"id": "queso-guac", "name": "Queso & Guac", "select": "multi", "flow": "build"},
        {"id": "sauces-salsas", "name": "Sauces & Salsas", "select": "multi", "flow": "build"},
        {"id": "toppings", "name": "Toppings", "select": "multi", "flow": "build"},
        {"id": "sides", "name": "Sides", "select": "multi", "flow": "extras"},
        {"id": "desserts", "name": "Desserts", "select": "multi", "flow": "extras"},
        {"id": "drinks", "name": "Drinks", "select": "single", "flow": "extras"},
    ],
    "components": components,
}
OUT.write_text(json.dumps(chain, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {OUT} with {len(components)} components", file=sys.stderr)
