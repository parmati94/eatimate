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
               row_sections regex (optional) -- a data row that also opens a section
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
  mode_servings: mode id -> serving_desc for every row in that mode.
  section_modes: "SECTION" -> size mode id. Use when the section names the
               size/format rather than the category (transposed sources):
               each row becomes one component per mode, id suffixed with the
               mode and only_modes set to it.
  variant_split: separator in a printed name ("Cheesesticks / 10\"") that marks
               a size family. First size seen heads it; the rest point at it.
  section_categories: "SECTION" or "SECTION/SUB" -> default category, or
               {"cat": ..., "suffix": "Salad"} to append " (Salad)" to every
               derived name/id in that section (same ingredient, per-format
               portions), or {"cat": ..., "strict": true} so the section keeps
               its own default even when another section's items entry shares
               the printed name, or {"cat": ..., "only": [names]} to keep only
               those items from a section (optional)
  corrections: component id -> [{field, used, reason}] for a cell the source
               contradicts within its own row (optional)
  layout.serving_brackets: lift a trailing "[...]" off the printed name into
               serving_desc (dump_html "items" mode carries it there)
"""
import json, re, sys, unicodedata
from pathlib import Path

FIELDS = ["calories", "fat_g", "sat_fat_g", "trans_fat_g", "cholesterol_mg",
          "sodium_mg", "carbs_g", "fiber_g", "sugars_g", "protein_g"]
TOK = r"(?:-|<1|\d+(?:\.\d+)?)"

def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("®", "")
    # Fold accents so "Jalapeño" ids as jalapeno, not jalape-o.
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
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
        self.serving_desc = None
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
    # A heading that is itself a data row: BWW's "6 COUNT BONELESS WINGS ..."
    # carries the naked-wing values AND opens the tier whose sauces follow.
    rowsec_re = re.compile(layout["row_sections"]) if layout.get("row_sections") else None
    skip_re = re.compile(layout["skip"]) if layout.get("skip") else None
    footer_re = re.compile(layout["footer"]) if layout.get("footer") else None
    stop_re = re.compile(layout["stop"]) if layout.get("stop") else None
    # Mirror of `stop`, for guides that open with a cover or a marketing
    # menu before the nutrition tables begin (Chipotle's paper menu).
    start_re = re.compile(layout["start"]) if layout.get("start") else None
    started = start_re is None
    pre = [(re.compile(a), b) for a, b in layout.get("pre_replace", [])]
    nums_only = re.compile(rf"^(?:{TOK}\s+){{{n-1}}}{TOK}$")
    # Some guides print two sizes side by side in one row ("370 / 740"), with
    # cells that are common to both left single ("0"). dual_split names the
    # two columns per section; each row then becomes two, tagged with the
    # section's labels so variant_split can collapse them into a size selector.
    dual_cfg = layout.get("dual_split", {})
    DUAL = rf"{TOK}\s*/\s*{TOK}|{TOK}"
    dual_re = re.compile(rf"^(?P<name>.+?)\s+(?P<cells>(?:(?:{DUAL})\s+){{{n-1}}}(?:{DUAL}))$") if dual_cfg else None
    cell_re = re.compile(DUAL)
    # Wrapped rows whose number line carries dual cells still need joining.
    nums_join = re.compile(rf"^(?:(?:{DUAL})\s+){{{n-1}}}(?:{DUAL})$") if dual_cfg else nums_only
    lines = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if footer_re: line = footer_re.sub("", line).strip()
        for a, b in pre: line = a.sub(b, line)
        if stop_re and stop_re.match(line): break
        if not started:
            # Inclusive, mirroring the exclusive `stop`: the range is
            # [start, stop). The marker is the first row we want, not the
            # last one we don't.
            if not start_re.match(line):
                continue
            started = True
        if not line or line.startswith("=====") or (skip_re and skip_re.match(line)):
            continue
        lines.append(line)
    # join wrapped names: "<name part>" / "<numbers>" / "<name rest>"
    joined, i = [], 0
    while i < len(lines):
        if nums_join.match(lines[i]) and joined and not row_re.match(joined[-1]) and not sec_re.match(joined[-1]):
            name, nums = joined.pop(), lines[i]
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if nxt and not row_re.match(nxt) and not sec_re.match(nxt) and not nums_join.match(nxt):
                name += " " + nxt; i += 1
            joined.append(f"{name} {nums}")
        else:
            joined.append(lines[i])
        i += 1
    rows, section, sub, pending = [], None, None, []
    for line in joined:
        if sub_re and sub_re.match(line):
            sub = sub_re.match(line).group(1); continue
        dual = dual_cfg.get(section or "") if dual_cfg else None
        if dual and not row_re.match(line):
            md = dual_re.match(line)
            if md:
                parts = cell_re.findall(md.group("cells"))
                for idx, label in enumerate(dual):
                    vals = [re.split(r"\s*/\s*", c)[idx] if "/" in c else c
                            for c in parts]
                    r = Row(section, sub, f"{md.group('name').strip()} / {label}",
                            dict(zip(cols, [num(t) for t in vals])),
                            [cols[i] for i, t in enumerate(vals) if t == "-"])
                    r.serving_desc = None
                    rows.append(r)
                continue
        m = row_re.match(line)
        if m and not layout.get("dash_rows_are_data", False) and re.fullmatch(r"(?:-\s*)+", m.group("toks")):
            continue  # all-dash rows carry no data
        if m:
            toks = m.group("toks").split()
            cells = dict(zip(cols, [num(t) for t in toks]))
            printed, serving_desc = m.group("name").strip(), None
            # dump_html "items" mode carries the source's own serving size in
            # brackets. It is not decoration: a Papa Bite row is per bite.
            if layout.get("serving_brackets"):
                b = re.search(r"\s*\[([^\]]+)\]$", printed)
                if b:
                    printed, serving_desc = printed[:b.start()].strip(), b.group(1)
            r = Row(section, sub, printed, cells,
                    [cols[i] for i, t in enumerate(toks) if t == "-"])
            r.serving_desc = serving_desc
            rows.append(r)
            if rowsec_re:
                ms = rowsec_re.match(line)
                if ms:
                    section = ms.group(1) if ms.groups() else ms.group(0)
                    sub = None
                    r.section = section
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
        # Prefer the printed gram weight over a bare "1 serving" -- it is the
        # only portion information these chains publish, and it is what makes a
        # row comparable to the next one.
        if serving_g and not d2:
            d2 = f"{serving_g} g"
    elif unit == "oz":
        serving_g, d2 = round(serving * 28.35), f"{serving:g} oz"
    else:
        serving_g = None
    c = {"id": id or slug(n2), "name": name or n2, "category": cat,
         "serving_desc": desc or row.serving_desc or d2 or "1 serving",
         "serving_g": serving_g}
    c.update(row.nutrients())
    # A dash in a nullable column means the chain does not publish it, which is
    # not the same as measuring zero. Only cholesterol is nullable today
    # (Chipotle publishes every other nutrient and no cholesterol at all).
    if "cholesterol_mg" in row.dashes:
        c["cholesterol_mg"] = None
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
        # Only correct a genuinely scrambled cell (Qdoba's Quesabirria prints
        # 95 g fat against 380 cal-from-fat). A printed fat within rounding
        # distance of cff/9 is consistent — keep it (Atwater estimates are
        # allowed to miss for meat/cheese).
        if abs(c["fat_g"] - r.cells["cff"] / 9) <= max(3, 0.4 * alt):
            continue
        if abs(4 * (c["protein_g"] + c["carbs_g"]) + 9 * alt - c["calories"]) <= tol:
            c["corrections"] = [{"field": "fat_g", "printed": c["fat_g"], "used": alt,
                "reason": f"PDF prints {c['fat_g']} g total fat but {r.cells['cff']:g} calories-from-fat and {c['calories']} kcal; {c['fat_g']} g fat would imply ~{est:.0f} kcal. {alt} g (= {r.cells['cff']:g}/9) makes the energy math consistent."}]
            c["fat_g"] = alt; fixed.append(c["id"])
    return fixed

def manual_corrections(cfg, components):
    """Config-declared fixes, for a cell the source contradicts elsewhere in its
    OWN row. Only use where the chain's other figures settle it -- never to
    substitute an outside source. Records what was printed next to what we used."""
    by_id = {c["id"]: c for c in components}
    fixed = []
    for cid, entries in cfg.get("corrections", {}).items():
        c = by_id.get(cid)
        if c is None:
            sys.exit(f"ERROR: correction targets unknown component {cid!r}")
        for e in entries:
            printed = c[e["field"]]
            if printed == e["used"]:
                continue
            c.setdefault("corrections", []).append(
                {"field": e["field"], "printed": printed,
                 "used": e["used"], "reason": e["reason"]})
            c[e["field"]] = e["used"]
            fixed.append(f"{cid}.{e['field']}")
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
    comps, seen, order_of, families = [], {}, {}, {}
    keys = list(items)
    for r in rows:
        seen[r.printed] = seen.get(r.printed, 0) + 1
        sec_cat = sec_cats.get(f"{r.section}/{r.sub}") or sec_cats.get(r.section or "")
        # The items map is keyed on the printed name, which is only unique
        # within a section: Papa John's sells a "BBQ Sauce" as both a pizza
        # sauce and a dipping cup. A strict section takes its own default
        # unless an entry names the section explicitly.
        strict = isinstance(sec_cat, dict) and sec_cat.get("strict")
        cands = [f"{r.section}/{r.printed}"]
        if not strict:
            cands += [f"{r.printed} [#{seen[r.printed]}]", r.printed]
        k = next((c for c in cands if c in items), None)
        spec = items.get(k) if k else None
        if spec is not None: order_of[id(r)] = keys.index(k)
        if spec is None and extra:
            out = extra(r)
            if out is False: r.used = True; continue
            if out: comps.append(out); continue
        if spec is None:
            cat = sec_cat
            if not cat: continue
            # An "only" list trims a section down to a named set. Papa John's
            # publishes its bottler's whole catalogue -- 153 drinks, most of
            # which no store stocks -- and the long tail is noise, not data.
            only = cat.get("only") if isinstance(cat, dict) else None
            if only is not None:
                base = r.printed.split(cfg.get("variant_split") or "\x00")[0].strip()
                if base not in only:
                    r.used = True
                    r.trimmed = True
                    continue
            r.defaulted = True
            spec = dict(cat) if isinstance(cat, dict) else {"cat": cat}
            if "suffix" in spec:
                n2, _ = split_serving(r.printed)
                spec.setdefault("name", f"{n2} ({spec['suffix']})"); spec.setdefault("id", slug(f"{n2} {spec['suffix']}"))
            elif "id_suffix" in spec:
                n2, _ = split_serving(r.printed)
                spec.setdefault("id", slug(f"{n2} {spec['id_suffix']}"))
            # A size family the source spells out in the row name itself
            # ("2 count Original Chicken Dippers") rather than with a separator.
            # Grouping by pattern instead of by literal name means a re-ingest
            # still groups a reworded row, and a newly added count joins the
            # family on its own instead of appearing loose.
            for rule in cfg.get("name_variants", []):
                secs = rule.get("sections")
                if secs and (r.section or "") not in secs:
                    continue
                mv = re.match(rule["pattern"], r.printed)
                if not mv:
                    continue
                fam_txt, label = mv.group("family").strip(), mv.group("label").strip()
                spec.setdefault("name", fam_txt)
                spec.setdefault("id", slug(r.printed))
                spec["variant_label"] = label
                fam = f"{spec.get('cat')}/{slug(fam_txt)}"
                if fam in families:
                    spec["variant_of"] = families[fam]
                else:
                    families[fam] = spec["id"]
                break
            sep = cfg.get("variant_split")
            if sep and sep in r.printed:
                # The source lists each size as its own row ("Cheesesticks / 10"").
                # That is the variant-family shape: one visible row plus a size
                # selector. First size seen heads the family.
                head, label = r.printed.split(sep, 1)
                spec.setdefault("id", slug(r.printed))
                spec.setdefault("name", head.strip())
                spec["variant_label"] = label.strip()
                # Family key must include the category: BWW prints the same dry
                # rubs as a dipper size family and again as a fries-topping one,
                # and a name-only key made the second point at the first's head.
                fam = f"{spec.get('cat')}/{slug(head)}"
                if fam in families:
                    spec["variant_of"] = families[fam]
                else:
                    families[fam] = spec["id"]
        if "skip" in spec: r.used = True; continue
        sec_modes = cfg.get("section_modes", {})
        mode = sec_modes.get(f"{r.section}/{r.sub}") or sec_modes.get(r.section or "")
        base_ord = order_of.get(id(r), len(keys) + len(comps))
        for n, sp in enumerate([spec] + spec.get("copies", [])):
            c = make_component(r, layout, sp.get("cat", spec["cat"]), sp.get("id"), sp.get("name"), sp.get("desc"))
            if mode and sp.get("mode_selector"):
                # This row IS the format choice: one per mode, always visible,
                # and picking it activates its mode. Without it every component
                # would be gated on a mode nothing could turn on.
                c["id"] = f"{c['id']}-{mode}"
                c["size_mode"] = mode
                c["name"] = sp.get("mode_names", {}).get(mode, c["name"])
                serv = cfg.get("mode_servings", {}).get(mode)
                if serv:
                    c["serving_desc"] = serv
                # Modes that are sizes of one crust collapse into a single row
                # with a size selector, rather than five rows all saying
                # "Original Crust". mode_names then carries the family name.
                mv = sp.get("mode_variants", {}).get(mode)
                if mv:
                    c["variant_label"] = mv["label"]
                    fam = f"{c['category']}/{mv['family']}"
                    if fam in families:
                        c["variant_of"] = families[fam]
                    else:
                        families[fam] = c["id"]
            elif mode:
                # Per-slice sources must say so on every row: "1 serving" hides
                # the one fact a pizza calculator turns on.
                serv = cfg.get("mode_servings", {}).get(mode)
                if serv:
                    c["serving_desc"] = serv
                # One component per (item, mode); the mode qualifies the id and
                # gates visibility, and the values are the chain's own for that
                # crust-and-size, not a multiplier applied to a base.
                c["id"] = f"{c['id']}-{mode}"
                c["only_modes"] = [mode]
                # A variant's head is per-mode too, so the reference has to be
                # qualified the same way or it points at a component that the
                # mode suffix has renamed out from under it.
                if sp.get("variant_of"):
                    sp = dict(sp, variant_of=f"{sp['variant_of']}-{mode}")
            if sp.get("size_mode"): c["size_mode"] = sp["size_mode"]
            if sp.get("only_modes"): c["only_modes"] = sp["only_modes"]
            if sp.get("variant_of"): c["variant_of"] = sp["variant_of"]
            if sp.get("variant_label"): c["variant_label"] = sp["variant_label"]
            if sp.get("feature"): c["feature"] = True
            c["_ord"] = base_ord + 0.001 * n
            comps.append(c)
    # Components declared in the config rather than read from the dump: either
    # worked out from figures the chain publishes (`reason` set, shown as
    # derived), or published by the chain somewhere the main source does not
    # reach -- a live menu that postdates a printed chart. menu_check.py finds
    # the latter; nothing here is inferred at run time.
    for d in cfg.get("derived", []):
        c = synthetic(d["id"], d["name"], d["cat"], d.get("desc"))
        c.pop("synthetic", None)
        c.update({k: v for k, v in d["values"].items()})
        if d.get("reason"): c["derived"] = d["reason"]
        if d.get("estimated"): c["estimated"] = d["estimated"]
        if d.get("size_mode"): c["size_mode"] = d["size_mode"]
        if d.get("only_modes"): c["only_modes"] = d["only_modes"]
        if d.get("serving_desc"): c["serving_desc"] = d["serving_desc"]
        target = next((x for x in comps if x["id"] == d.get("after")), None)
        c["_ord"] = (target["_ord"] + 0.5) if target else (10**6 - 1)
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
    # Rows matched by a section default rather than an items entry are NOT
    # errors -- that is how section_categories chains stay current when a chain
    # adds an item. But they took a GUESSED category, so say how many, or a new
    # menu item can slip in unreviewed.
    trimmed = [r.printed for r in rows if getattr(r, "trimmed", False)]
    if trimmed:
        print(f"  note: {len(trimmed)} rows dropped by a section 'only' list")
    defaulted = [r.printed for r in rows if getattr(r, "defaulted", False)]
    if defaulted:
        print(f"  note: {len(defaulted)} rows took a section default (no items entry); "
              f"review the diff for new items")
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
    # meta.source also carries extraction knobs (matrix, plain_ua, html_urls...).
    # Those describe how to READ the source, not the chain, so they stay in
    # ingest/chains and never reach the app -- whose schema is strict.
    chain["source"] = {k: v for k, v in chain["source"].items()
                       if k in ("pdf_url", "html_url", "retrieved")}
    # Same for meta-level knobs: menu_check tells menu_check.py where the live
    # menu is; the app has no use for it and its schema would reject it.
    for k in ("menu_check",):
        chain.pop(k, None)
    out = Path(out_dir) / f"{slug_}.json"
    out.write_text(json.dumps(chain, indent=2, ensure_ascii=False) + "\n")
    dashes = [(r.printed, [d for d in r.dashes if d != "cholesterol_mg"])
              for r in rows if [d for d in r.dashes if d != "cholesterol_mg"]]
    if dashes: print(f"  note: '-' cells read as 0: {dashes}", file=sys.stderr)
    nochol = [r.printed for r in rows if "cholesterol_mg" in r.dashes]
    if nochol:
        print(f"  note: {len(nochol)} rows publish no cholesterol", file=sys.stderr)
    print(f"{slug_}: {len(rows)} PDF rows -> {len(components)} components "
          f"({sum(1 for c in components if c.get('synthetic'))} synthetic, "
          f"{sum(1 for c in components if c.get('corrections'))} corrected) -> {out}", file=sys.stderr)
    return out
