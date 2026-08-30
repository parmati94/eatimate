"""Qdoba — deterministic extraction from the pdfplumber dump of Nutrition_8.5.26.pdf.

Layout (2026): rows are
  <name> [<allergen codes>|-] <serving> <13 numbers>
columns after the allergen token (confirmed from the rotated header + Black Beans row):
  Serving(g | fl oz for drinks) | Cal | CalFromFat | Fat | SatFat | TransFat | Chol |
  Carb | Fiber | Sugar | Protein | Sodium | Potassium
NOTE: this differs from the 2020 PDF (sodium used to follow cholesterol). Some
rows lack the allergen dash; some cells print "-" (treated as 0, listed in
report); a page footer ("1of5") fuses onto the last row of a page.
"""
import json, re, sys
from pathlib import Path

RAW = Path("data/raw/qdoba/raw_dump_2026.txt")
OUT = Path("data/chains/qdoba.json")
TOK = r"(?:-|<1|\d+(?:\.\d+)?)"
# name, optional allergen token ("-" or codes like MWG, WG*), serving (always
# numeric), then 12 cells that may be "-" / "<1"; optional fused page footer.
ROW = re.compile(rf"^(?P<name>.+?)(?:\s+(?P<al>-|[A-Z][A-Za-z]*\*?))?\s+(?P<serv>\d+(?:\.\d+)?)\s+(?P<toks>(?:{TOK}\s+){{11}}{TOK})(?:\s+\dof5)?$")

def num(x):
    if x == "-": return 0
    if x == "<1": return 0.5
    return int(x) if re.fullmatch(r"\d+", x) else float(x)

rows, section = [], None
for line in RAW.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("=====") or line.startswith("Nutrition Facts 2026") or len(line) <= 2:
        continue
    m = ROW.match(line)
    if m and "refer to caloric" not in line:
        name = m.group("name").strip()
        toks = [m.group("serv")] + m.group("toks").split()
        vals = [num(t) for t in toks]
        dashes = [i for i, t in enumerate(toks) if t == "-"]
        rows.append({"section": section, "name": name, "vals": vals, "dashes": dashes})
    elif re.match(r"^(Ingredients for Entrées|Signature Eats®|Small Bites|Limited Time Offerings|Ingredients for Kids Items|Fountain Beverages|Bottled Beverages|Dessert)", line):
        section = line.split(" (")[0]
print(f"parsed {len(rows)} rows", file=sys.stderr)

# value indexes: 0 serving, 1 cal, 2 cff, 3 fat, 4 sat, 5 trans, 6 chol, 7 carb, 8 fiber, 9 sugar, 10 prot, 11 sodium, 12 potassium
def nutrients(v):
    return {"calories": v[1], "fat_g": v[3], "sat_fat_g": v[4], "trans_fat_g": v[5], "cholesterol_mg": v[6],
            "sodium_mg": v[11], "carbs_g": v[7], "fiber_g": v[8], "sugars_g": v[9], "protein_g": v[10]}

def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("®", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

SERV = re.compile(r"\((\.?\d+(?:\.\d+)?)\s*(oz\.?|\")\s*\)")
def split_name(printed):
    """'Grilled Steak (3.5 oz.)' -> ('Grilled Steak', '3.5 oz'); keeps other parens like (US)."""
    m = SERV.search(printed)
    desc = None
    if m:
        q, unit = m.group(1), m.group(2)
        q = q.lstrip(".") and (("0" + q) if q.startswith(".") else q)
        desc = f'{q} oz' if unit.startswith("oz") else f'1 tortilla ({q}")'
        printed = (printed[:m.start()] + printed[m.end():])
    name = re.sub(r"\s+", " ", printed).replace("**", "").replace(" ,", ",").strip(" -")
    return name, desc

# printed name -> (category, id, display name, serving_desc). Ids kept from the
# 2020 file wherever the item persists so bookmarked ?m= links keep working.
MAP = {
  "Flour Tortilla (5.5\")": ("base", "flour-tortilla-5-5", None, None),
  "Flour Tortilla (10\")": ("base", "flour-tortilla-10", None, None),
  "Flour Tortilla (12.5\")": ("base", "flour-tortilla-12-5", None, None),
  "Crispy Taco Shell**": ("base", "crispy-taco-shell", "Crispy Taco Shell", "1 shell"),
  "Crunchy Tortilla Shell": ("base", "crunchy-tortilla-bowl", "Crunchy Tortilla Shell (salad bowl)", "1 shell"),
  "Cilantro Lime Rice (4 oz.) (v)": ("rice", "cilantro-lime-rice", "Cilantro Lime Rice", None),
  "Seasoned Brown Rice (4 oz.) (v)": ("rice", "brown-rice-seasoned", "Seasoned Brown Rice", None),
  "Black Beans (4 oz.) (v)": ("beans", "black-beans", "Black Beans", None),
  "Pinto Beans (4 oz.) (v)": ("beans", "pinto-beans", "Pinto Beans", None),
  "Grilled Adobo Chicken (3.5 oz.)": ("proteins", "chicken-grilled-adobo", None, None),
  "Grilled Steak (3.5 oz.)": ("proteins", "steak-grilled", None, None),
  "Ground Beef (3.5 oz.)": ("proteins", "beef-ground", None, None),
  "Brisket Birria (3.5 oz)": ("proteins", "brisket-birria", None, None),
  "Chorizo (3.0 oz.)": ("proteins", "chorizo", None, None),
  "Chorizo (1.5 oz.)": ("proteins", "chorizo-1-5oz", "Chorizo (half portion)", None),
  "Pork Carnitas (3.5 oz.)": ("proteins", "pork-pulled", None, None),
  "Plant-Based Impossible™ (3.1 oz.) *select locations only*": ("proteins", "impossible-plant-based", "Plant-Based Impossible™ (select locations)", None),
  "Eggs (6 oz.)": ("proteins", "eggs", None, None),
  "Bacon (Select Locations) (2 oz.)": ("proteins", "bacon", "Bacon (select locations)", None),
  "Bacon (Select Locations) (1 oz.)": ("proteins", "bacon-1oz", "Bacon (select locations, 1 oz)", None),
  "Spicy Tequila Lime Steak (3.5 oz)": ("proteins", "spicy-tequila-lime-steak", "Spicy Tequila Lime Steak (limited time)", None),
  "Three Cheese Queso (2 oz.)": ("queso-sauces", "three-cheese-queso-2oz", "3-Cheese Queso (2 oz)", None),
  "Three Cheese Queso (4 oz.)": ("queso-sauces", "three-cheese-queso-4oz", "3-Cheese Queso (4 oz)", None),
  "Queso Diablo (2 oz.)": ("queso-sauces", "queso-diablo", "Queso Diablo (2 oz)", None),
  "Queso Diablo (4 oz.)": ("queso-sauces", "queso-diablo-4oz", "Queso Diablo (4 oz)", None),
  "Chile Crema (1 oz)": ("queso-sauces", "chile-crema", None, None),
  "Picante Ranch Dressing (1.5 oz.)": ("queso-sauces", "picante-ranch-dressing", None, None),
  "Citrus Vinaigrette (1.5 oz.) (US)": ("queso-sauces", "citrus-vinaigrette", "Citrus Vinaigrette", None),
  "Citrus Vinaigrette (1.5 oz.) (CANADA)": ("queso-sauces", "citrus-vinaigrette-canada", "Citrus Vinaigrette (Canada)", None),
  "Pico de Gallo (1 oz.)": ("salsas", "pico-de-gallo", None, None),
  "Salsa Roja (1 oz.)": ("salsas", "salsa-roja", None, None),
  "Salsa Verde (1 oz.)": ("salsas", "salsa-verde", None, None),
  "Habanero Salsa (1 oz.)": ("salsas", "habanero-salsa", None, None),
  "Chile Corn Salsa (1 oz.)": ("salsas", "chile-corn-salsa", None, None),
  "Roasted Tomato Salsa (1 oz.)": ("salsas", "roasted-tomato-salsa", None, None),
  "Shredded Cheese (1.0 oz.)": ("toppings", "cheese-shredded", "Shredded Cheese", "1 oz"),
  "Cotija Cheese (.25 oz.)": ("toppings", "cheese-cotija", None, None),
  "Sour Cream, (1 oz.)": ("toppings", "sour-cream", "Sour Cream", None),
  "Hand Crafted Guacamole (2 oz.)": ("toppings", "hand-smashed-guac-2oz", "Hand Crafted Guacamole (2 oz)", None),
  "Hand Crafted Guacamole (4 oz.)": ("toppings", "hand-smashed-guac-4oz", "Hand Crafted Guacamole (4 oz)", None),
  "Romaine Lettuce (0.25 oz.)": ("toppings", "lettuce-shredded", "Romaine Lettuce (topping)", None),
  "Romaine Lettuce for Salad (3.5 oz)": ("toppings", "lettuce-romaine", "Romaine Lettuce (salad base)", None),
  "Fajita Veggies (2 oz.)": ("toppings", "fajita-veggies", None, None),
  "Pickled Red Onion (0.8 oz)": ("toppings", "pickled-red-onion", None, None),
  "Chopped Cilantro (.12 oz )": ("toppings", "chopped-cilantro", None, "0.12 oz"),
  "Tortilla Chips (4 oz.)": ("sides", "corn-tortilla-chips", "Tortilla Chips", None),
  "Tortilla Strips (0.5 oz.)": ("sides", "tortilla-strips", None, None),
  "Seasoned Potatoes (2 oz.)": ("sides", "potatoes-seasoned", None, None),
  "Churro Chips": ("desserts", "churro-chips", "Churro Chips (limited time)", "1 serving (64 g)"),
  "Apple Sauce, Natural": ("kids-ingredients", "apple-sauce", None, "1 cup (111 g)"),
  "Black Beans (2 oz.)": ("kids-ingredients", "black-beans-kids", "Black Beans (kids)", None),
  "Cilantro Lime Rice (2 oz.)": ("kids-ingredients", "cilantro-lime-rice-kids", "Cilantro Lime Rice (kids)", None),
  "Grilled Chicken (1.75 oz.)": ("kids-ingredients", "chicken-grilled-adobo-kids", "Grilled Chicken (kids)", None),
  "Grilled Steak (1.75 oz.)": ("kids-ingredients", "steak-grilled-kids", "Grilled Steak (kids)", None),
  "Hand Smashed Guac (1 oz.)": ("kids-ingredients", "hand-smashed-guac-1oz", "Hand Smashed Guac (kids)", None),
  "Pinto Beans (2 oz.)": ("kids-ingredients", "pinto-beans-kids", "Pinto Beans (kids)", None),
  "Pork Carnitas (2 oz.)": ("kids-ingredients", "pork-pulled-kids", "Pork Carnitas (kids)", None),
  "Seasoned Brown Rice (2 oz.)": ("kids-ingredients", "brown-rice-seasoned-kids", "Seasoned Brown Rice (kids)", None),
  "Shredded Cheese (0.5 oz.)": ("kids-ingredients", "cheese-shredded-kids", "Shredded Cheese (kids)", None),
  "Sour Cream (1 oz.)": ("kids-ingredients", "sour-cream-kids", "Sour Cream (kids)", None),
  "Three Cheese Queso (1 oz.)": ("kids-ingredients", "three-cheese-queso-1oz", "3-Cheese Queso (kids)", None),
  "Tortilla Chips (2 oz.)": ("kids-ingredients", "tortilla-chips-kids", "Tortilla Chips (kids)", None),
  "Side (black beans w/ cheese)": ("kids-ingredients", "kids-side-beans-cheese", "Side (black beans w/ cheese)", "1 side"),
  "Double Chocolate Brownie (US)": ("desserts", "double-chocolate-brownie", "Double Chocolate Brownie", "1 brownie"),
  "Double Chocolate Brownie (CANADA)": ("desserts", "double-chocolate-brownie-canada", "Double Chocolate Brownie (Canada)", "1 brownie"),
  "Chocolate Chunk Cookie (US)": ("desserts", "chocolate-chunk-cookie", "Chocolate Chunk Cookie", "1 cookie"),
  "Chocolate Chunk Cookie (CANADA)": ("desserts", "chocolate-chunk-cookie-canada", "Chocolate Chunk Cookie (Canada)", "1 cookie"),
  "Churro bites (CANADA only)": ("desserts", "churro-bites-canada", "Churro Bites (Canada only)", "1 serving (100 g)"),
  "Nutella (CANADA only)": ("desserts", "nutella-canada", "Nutella (Canada only)", "15 g"),
}
DRINK_IDS = {  # bottled/other drinks: printed -> (id, name)
  "Dasani Water (16.9 fl. oz.)": ("dasani-water", "Dasani Water"),
  "Coca Cola (20 fl. oz.)": ("coca-cola-bottle", "Coca-Cola (bottle)"),
  "Diet Coke (20 fl. oz.)": ("diet-coke-bottle", "Diet Coke (bottle)"),
  "Mexican Coke (12 fl. Oz)": ("mexican-coca-cola", "Mexican Coke"),
  "Minute Maid Kid's Apple Juice Box (6 fl. oz.)": ("minute-maid-kids-apple-juice", "Minute Maid Kid's Apple Juice Box"),
  "Milk, Chocolate lowfat 1% (7 fl. oz.)/ CA Standards": ("chocolate-milk-lowfat", "Chocolate Milk, Lowfat 1% (CA standards)"),
  "Milk, Chocolate lowfat 1% (8 fl. oz.)/ Fed Standards": ("chocolate-milk-lowfat-8oz", "Chocolate Milk, Lowfat 1% (Fed standards)"),
  "Milk, White lowfat 1% (7 fl. oz.)/ CA Standards": ("white-milk-lowfat-7oz", "White Milk, Lowfat 1% (CA standards)"),
  "Milk, White lowfat 1% (8 fl. oz.)/ Fed Standards": ("white-milk-lowfat-8oz", "White Milk, Lowfat 1% (Fed standards)"),
  "Minute Maid Lemonade(HFCS) Reg": ("minute-maid-lemonade-reg", "Minute Maid Lemonade (Reg)"),
  "Minute Maid Lemonade(HFCS) Lrg": ("minute-maid-lemonade-lrg", "Minute Maid Lemonade (Lrg)"),
}
SIG_DESC = [("Burrito", "1 burrito"), ("Quesadilla", "1 quesadilla"), ("Bowl", "1 bowl"), ("Salad", "1 salad"), ("Tacos (3)", "3 tacos")]

components, corrections_applied = [], []
def zero(id, name, category, desc):
    c = {"id": id, "name": name, "category": category, "serving_desc": desc, "serving_g": None, "synthetic": True}
    c.update({k: 0 for k in nutrients([0]*13)}); return c
components.append(zero("bowl", "Bowl (no tortilla)", "base", "1 bowl"))
seen_ids = set()
for r in rows:
    printed, v, sec = r["name"], r["vals"], r["section"]
    drink = sec in ("Fountain Beverages", "Bottled Beverages")
    if printed in MAP:
        cat, cid, name, desc = MAP[printed]
        n2, d2 = split_name(printed)
        name = name or n2; desc = desc or d2 or "1 serving"
        serving_g = round(v[0]) if v[0] else None
    elif sec == "Signature Eats®":
        cat, name = "signature-eats", printed.replace("*select locations only*", "(select locations)").strip()
        cid = slug(name); desc = next((d for k, d in SIG_DESC if k in name), "1 serving"); serving_g = round(v[0])
    elif drink or "Milk" in printed:
        cat = "drinks"; serving_g = None; desc = f"{v[0]:g} fl oz"
        if printed in DRINK_IDS: cid, name = DRINK_IDS[printed]
        else:
            m = re.search(r"\((Reg|Lrg)\)$", printed)
            if m:
                name = printed; cid = slug(printed[:m.start()]) + "-" + m.group(1).lower()
            else:
                name = re.sub(r"\s*\([\d.]+\s*fl\.?\s*oz\.?\)", "", printed).strip(); cid = slug(name)
                if cid in seen_ids: cid = f"{cid}-{v[0]:g}oz"
    elif "(Flour or Taco shell)" in printed or printed.startswith("Mini Bowl"):
        continue
    else:
        print("UNMAPPED ROW:", sec, printed, file=sys.stderr); continue
    if cid in seen_ids: print("DUPLICATE ID:", cid, printed, file=sys.stderr)
    seen_ids.add(cid)
    if cid == "flour-tortilla-5-5" and any(c["id"] == cid for c in components):
        seen_ids.discard(cid); continue  # kids row is identical to the entree row
    c = {"id": cid, "name": name, "category": cat, "serving_desc": desc, "serving_g": serving_g}
    c.update(nutrients(v))
    if r["dashes"]: c["_dashes"] = r["dashes"]
    r["used"] = True
    components.append(c)

# Corrections: cal-from-fat column lets us catch a scrambled Total Fat cell.
for c in components:
    if c.get("synthetic"): continue
    est = 4 * (c["protein_g"] + c["carbs_g"]) + 9 * c["fat_g"]
    if abs(est - c["calories"]) > max(0.25 * c["calories"], 20):
        row = next(r for r in rows if r.get("used") and r["vals"][1] == c["calories"] and r["vals"][3] == c["fat_g"] and r["vals"][10] == c["protein_g"])
        cff = row["vals"][2]
        fat_from_cff = round(cff / 9)
        est2 = 4 * (c["protein_g"] + c["carbs_g"]) + 9 * fat_from_cff
        if abs(est2 - c["calories"]) <= max(0.25 * c["calories"], 20):
            c["corrections"] = [{"field": "fat_g", "printed": c["fat_g"], "used": fat_from_cff,
                "reason": f"PDF prints {c['fat_g']} g total fat but {cff} calories-from-fat and {c['calories']} kcal; {c['fat_g']} g fat would imply ~{est:.0f} kcal. {fat_from_cff} g (= {cff}/9) makes the energy math consistent."}]
            corrections_applied.append(c["id"]); c["fat_g"] = fat_from_cff
dash_notes = [(c["id"], c.pop("_dashes")) for c in components if "_dashes" in c]
print("corrections:", corrections_applied, file=sys.stderr)
print("dash cells treated as 0:", dash_notes, file=sys.stderr)
print("UNUSED PDF ROWS:", [r["name"] for r in rows if not r.get("used") and "refer to caloric" not in r["name"]], file=sys.stderr)

chain = {
    "name": "Qdoba", "slug": "qdoba",
    "source": {"pdf_url": "https://assets.ctfassets.net/0tc4847zqy12/bQFJBCmsAk4ww4qzdfAOm/27c88d608796913d6a47899ecffb6a3c/Nutrition_8.5.26.pdf", "retrieved": "2026-08-30"},
    "disclaimer_extra": "Qdoba nutrition chart dated August 5, 2026. Items marked Canada / select locations / limited time are as printed on the chart.",
    "categories": [
        {"id": "base", "name": "Base / Format", "select": "single", "flow": "build"},
        {"id": "rice", "name": "Rice", "select": "single", "flow": "build"},
        {"id": "beans", "name": "Beans", "select": "single", "flow": "build"},
        {"id": "proteins", "name": "Proteins", "select": "single", "flow": "build"},
        {"id": "queso-sauces", "name": "Queso, Sauces & Dressings", "select": "multi", "flow": "build"},
        {"id": "salsas", "name": "Salsas", "select": "multi", "flow": "build"},
        {"id": "toppings", "name": "Toppings", "select": "multi", "flow": "build"},
        {"id": "sides", "name": "Sides", "select": "multi", "flow": "extras"},
        {"id": "signature-eats", "name": "Signature Eats", "select": "single", "flow": "extras"},
        {"id": "kids-ingredients", "name": "Kids Ingredients", "select": "multi", "flow": "extras"},
        {"id": "desserts", "name": "Desserts", "select": "multi", "flow": "extras"},
        {"id": "drinks", "name": "Drinks", "select": "single", "flow": "extras"},
    ],
    "components": components,
}
OUT.write_text(json.dumps(chain, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {OUT} with {len(components)} components", file=sys.stderr)
