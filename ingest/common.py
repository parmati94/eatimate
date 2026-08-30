"""Shared ingest machinery. Per-chain extractors are thin: they load
ingest/chains/<slug>.json (layout + category table), parse the pdfplumber dump,
map rows to components, and call finish() which fails loudly on anything
unaccounted for. Same PDF in -> byte-identical JSON out.

Config (ingest/chains/<slug>.json):
  meta:        name, slug, source{pdf_url, retrieved}, disclaimer_extra
  categories:  as in lib/schema.ts
  layout:      columns   ordered list of cell names after the (optional) allergen
                         token; nutrient names as in the schema plus any of
                         serving, cff, potassium (ignored) etc.
               allergen  true if rows carry an allergen token ("-" or codes)
               serving   "g" | "oz" | null  — how the serving cell is read
               floz_sections  section names whose serving cell is fl oz (drinks)
               sections  regex; a line matching it starts a new section
               subsections regex with one group (optional; e.g. DIG Sides/Mains)
               skip      regex; lines to ignore
               footer    regex stripped from line ends (fused page numbers)
               pre_replace  list of [regex, replacement] applied to every line
                         before any matching — for normalizing odd layouts
                         (serving embedded in names, per-section column sets)
               stop      regex; parsing ends at the first line matching it
                         (e.g. an allergen guide that follows the nutrition table)
             Wrapped names are handled: a numbers-only line takes the preceding
             prose line as its name, plus the following line when that line is
             neither a row nor a section header.
  items:       printed row name -> {cat, id?, name?, desc?, size_mode?,
               copies?} (id/name/desc derived when omitted); or {"skip":
               reason}. `copies` is a list of extra specs emitting clones of
               the same printed row (e.g. a Footlong variant of a 6" bread —
               same printed values, its own name/size_mode). A repeated
               printed name is addressed as "<name> [#2]" (2nd occurrence in
               the dump). Table order = display order within a category.
  synthetic:   [{id, name, cat, desc, after?}] zero-nutrient menu structure
  section_categories: "SECTION" or "SECTION/SUB" -> default category, or
               {"cat": ..., "suffix": "Salad"} to append " (Salad)" to every
               derived name/id in that section (same ingredient, per-format
               portions) (optional)
"""
import json, re, sys
from pathlib import Path

FIELDS = ["calories", "fat_g", "sat_fat_g", "trans_fat_g", "cholesterol_mg",
          "sodium_mg", "carbs_g", "fiber_g", "sugars_g", "protein_g"]
TOK = r"(?:-|<1|\d+(?:\.\d+)?)"

def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("®", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def num(x):
    if x == "-": return 0
    if x == "<1": return 0.5
    return int(x) if re.fullmatch(r"\d+", x) else float(x)

SERV = re.compile(r"\((\.?\d+(?:\.\d+)?)\s*(oz\.?|\")\s*\)")
def split_serving(printed):
    """'Grilled Steak (3.5 oz.)' -> ('Grilled Steak', '3.5 oz'); other parens kept."""
    m = SERV.search(printed)
    desc = None
    if m:
        q, unit = m.group(1), m.group(2)
        if q.startswith("."): q = "0" + q
        desc = f"{q} oz" if unit.startswith("oz") else f'1 tortilla ({q}")'
        printed = printed[:m.start()] + printed[m.end():]
    name = re.sub(r"\s+", " ", printed).replace("**", "").replace(" ,", ",").strip(" -")
    return name, desc

class Row:
    def __init__(self, section, sub, printed, cells, dashes):
        self.section, self.sub, self.printed, self.cells, self.dashes = section, sub, printed, cells, dashes
        self.used = False
    def nutrients(self):
        return {f: self.cells[f] for f in FIELDS}

def parse_dump(path, layout):
    cols = layout["columns"]
    n = len(cols)
    al = r"(?:\s+(?P<al>-|[A-Z][A-Za-z]*\*?))?" if layout.get("allergen") else ""
    # first cell (serving) is always numeric when present; others may be "-"/"<1"
    row_re = re.compile(rf"^(?P<name>.+?){al}\s+(?P<toks>(?:{TOK}\s+){{{n-1}}}{TOK})$")
    sec_re = re.compile(layout["sections"])
    sub_re = re.compile(layout["subsections"]) if layout.get("subsections") else None
    skip_re = re.compile(layout["skip"]) if layout.get("skip") else None
    footer_re = re.compile(layout["footer"]) if layout.get("footer") else None
    stop_re = re.compile(layout["stop"]) if layout.get("stop") else None
    pre = [(re.compile(a), b) for a, b in layout.get("pre_replace", [])]
    nums_only = re.compile(rf"^(?:{TOK}\s+){{{n-1}}}{TOK}$")
    lines = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if footer_re: line = footer_re.sub("", line).strip()
        for a, b in pre: line = a.sub(b, line)
        if stop_re and stop_re.match(line): break
        if not line or line.startswith("=====") or (skip_re and skip_re.match(line)):
            continue
        lines.append(line)
    # join wrapped names: "<name part>" / "<numbers>" / "<name rest>"
    joined, i = [], 0
    while i < len(lines):
        if nums_only.match(lines[i]) and joined and not row_re.match(joined[-1]) and not sec_re.match(joined[-1]):
            name, nums = joined.pop(), lines[i]
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if nxt and not row_re.match(nxt) and not sec_re.match(nxt) and not nums_only.match(nxt):
                name += " " + nxt; i += 1
            joined.append(f"{name} {nums}")
        else:
            joined.append(lines[i])
        i += 1
    rows, section, sub, pending = [], None, None, []
    for line in joined:
        if sub_re and sub_re.match(line):
            sub = sub_re.match(line).group(1); continue
        m = row_re.match(line)
        if m and not layout.get("dash_rows_are_data", False) and re.fullmatch(r"(?:-\s*)+", m.group("toks")):
            continue  # all-dash rows carry no data
        if m:
            toks = m.group("toks").split()
            cells = dict(zip(cols, [num(t) for t in toks]))
            rows.append(Row(section, sub, m.group("name").strip(), cells,
                            [cols[i] for i, t in enumerate(toks) if t == "-"]))
        elif sec_re.match(line):
            section, sub = sec_re.match(line).group(0), None
        else:
            pending.append(line)  # continuation text / prose; reported by finish()
    return rows, pending

def make_component(row, layout, cat, id=None, name=None, desc=None):
    n2, d2 = split_serving(row.printed)
    serving = row.cells.get("serving")
    unit = layout.get("serving")
    if row.section in layout.get("floz_sections", []):
        serving_g, d2 = None, f"{serving:g} fl oz"
    elif unit == "g":
        serving_g = round(serving) if serving else None
    elif unit == "oz":
        serving_g, d2 = round(serving * 28.35), f"{serving:g} oz"
    else:
        serving_g = None
    c = {"id": id or slug(n2), "name": name or n2, "category": cat,
         "serving_desc": desc or d2 or "1 serving", "serving_g": serving_g}
    c.update(row.nutrients())
    row.used = True
    return c

def synthetic(id, name, cat, desc):
    c = {"id": id, "name": name, "category": cat, "serving_desc": desc, "serving_g": None}
    c.update({f: 0 for f in FIELDS}); c["synthetic"] = True
    return c

def cff_corrections(components, rows):
    """When printed Total Fat makes the energy math impossible but the PDF's own
    calories-from-fat column (/9) makes it consistent, use that and record it."""
    by_vals = {}
    for r in rows:
        if "cff" in r.cells: by_vals[(r.cells["calories"], r.cells["fat_g"], r.cells["protein_g"], r.cells["carbs_g"])] = r
    fixed = []
    for c in components:
        if c.get("synthetic"): continue
        est = 4 * (c["protein_g"] + c["carbs_g"]) + 9 * c["fat_g"]
        tol = max(0.25 * c["calories"], 20)
        if abs(est - c["calories"]) <= tol: continue
        r = by_vals.get((c["calories"], c["fat_g"], c["protein_g"], c["carbs_g"]))
        if not r: continue
        alt = round(r.cells["cff"] / 9)
        if abs(4 * (c["protein_g"] + c["carbs_g"]) + 9 * alt - c["calories"]) <= tol:
            c["corrections"] = [{"field": "fat_g", "printed": c["fat_g"], "used": alt,
                "reason": f"PDF prints {c['fat_g']} g total fat but {r.cells['cff']:g} calories-from-fat and {c['calories']} kcal; {c['fat_g']} g fat would imply ~{est:.0f} kcal. {alt} g (= {r.cells['cff']:g}/9) makes the energy math consistent."}]
            c["fat_g"] = alt; fixed.append(c["id"])
    return fixed

def load_config(slug_):
    return json.load(open(Path(__file__).parent / "chains" / f"{slug_}.json"))

def build(cfg, rows, extra=None):
    """Default mapping: items table + section defaults. Returns components in
    category order, then table/PDF order. `extra(row) -> component|None|False`
    lets a chain add logic; False = handled elsewhere (mark used, emit nothing)."""
    items = cfg.get("items", {})
    sec_cats = cfg.get("section_categories", {})
    layout = cfg["layout"]
    comps, seen, order_of = [], {}, {}
    keys = list(items)
    for r in rows:
        seen[r.printed] = seen.get(r.printed, 0) + 1
        k = f"{r.printed} [#{seen[r.printed]}]"
        k = k if k in items else r.printed
        spec = items.get(k)
        if spec is not None: order_of[id(r)] = keys.index(k)
        if spec is None and extra:
            out = extra(r)
            if out is False: r.used = True; continue
            if out: comps.append(out); continue
        if spec is None:
            cat = sec_cats.get(f"{r.section}/{r.sub}") or sec_cats.get(r.section or "")
            if not cat: continue
            spec = dict(cat) if isinstance(cat, dict) else {"cat": cat}
            if "suffix" in spec:
                n2, _ = split_serving(r.printed)
                spec.setdefault("name", f"{n2} ({spec['suffix']})"); spec.setdefault("id", slug(f"{n2} {spec['suffix']}"))
            elif "id_suffix" in spec:
                n2, _ = split_serving(r.printed)
                spec.setdefault("id", slug(f"{n2} {spec['id_suffix']}"))
        if "skip" in spec: r.used = True; continue
        base_ord = order_of.get(id(r), len(keys) + len(comps))
        for n, sp in enumerate([spec] + spec.get("copies", [])):
            c = make_component(r, layout, sp.get("cat", spec["cat"]), sp.get("id"), sp.get("name"), sp.get("desc"))
            if sp.get("size_mode"): c["size_mode"] = sp["size_mode"]
            if sp.get("only_modes"): c["only_modes"] = sp["only_modes"]
            c["_ord"] = base_ord + 0.001 * n
            comps.append(c)
    # reverse so a synthetic may sit "before" a later-listed synthetic
    for n, s in reversed(list(enumerate(cfg.get("synthetic", [])))):
        c = synthetic(s["id"], s["name"], s["cat"], s["desc"])
        if s.get("size_mode"): c["size_mode"] = s["size_mode"]
        if s.get("only_modes"): c["only_modes"] = s["only_modes"]
        target = next((x for x in comps if x["id"] == s.get("before")), None)
        c["_ord"] = (target["_ord"] - 0.5 + 0.001 * n) if target else (10**6 + n)
        comps.append(c)
    order = {c["id"]: i for i, c in enumerate(cfg["categories"])}
    comps.sort(key=lambda c: (order[c["category"]], c["_ord"]))  # category order, then items-table order
    for c in comps: c.pop("_ord", None)
    return comps

def finish(cfg, components, rows, pending, out_dir="data/chains"):
    slug_ = cfg["meta"]["slug"]
    errors = []
    unused = [r.printed for r in rows if not r.used]
    if unused: errors.append(f"unconsumed PDF rows: {unused}")
    if pending: errors.append(f"unparsed non-empty lines: {pending[:8]}{' ...' if len(pending) > 8 else ''}")
    ids = [c["id"] for c in components]
    dups = sorted({i for i in ids if ids.count(i) > 1})
    if dups: errors.append(f"duplicate ids: {dups}")
    cats = {c["id"] for c in cfg["categories"]}
    bad = [c["id"] for c in components if c["category"] not in cats]
    if bad: errors.append(f"unknown category on: {bad}")
    if errors:
        for e in errors: print("ERROR:", e, file=sys.stderr)
        sys.exit(1)
    chain = dict(cfg["meta"]); chain["categories"] = cfg["categories"]; chain["components"] = components
    out = Path(out_dir) / f"{slug_}.json"
    out.write_text(json.dumps(chain, indent=2, ensure_ascii=False) + "\n")
    dashes = [(r.printed, r.dashes) for r in rows if r.dashes]
    if dashes: print(f"  note: '-' cells read as 0: {dashes}", file=sys.stderr)
    print(f"{slug_}: {len(rows)} PDF rows -> {len(components)} components "
          f"({sum(1 for c in components if c.get('synthetic'))} synthetic, "
          f"{sum(1 for c in components if c.get('corrections'))} corrected) -> {out}", file=sys.stderr)
    return out
