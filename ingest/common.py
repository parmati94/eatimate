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

  --- more layout keys ---
  layout.row_sections / subsections: see above.
  layout.dual_split: two columns of the same table read as two rows each,
               tagged with the section's labels so variant_split can collapse
               them into a size selector.
  layout.tier_rows + head: a table printing one line per portion with the name
               on only the first. `head` names the tier that heads the family,
               and it matters: EZ heading a family made every meal built from
               it understate, because tapping the row gave the light portion.
  layout.dash_rows_are_data: a row of all "-" is real zeroes, not a spacer.

  --- more top-level keys ---
  derived:     [{id, name, cat, values, reason?, estimated?, after?}] a
               component computed from figures the chain publishes (shown as
               "derived") or published somewhere the main source does not
               reach. Never inferred at run time.
  section_subtract: "SECTION" -> component ID whose values are subtracted from
               every row in that section. Potbelly's sandwich totals include
               white bread at that size, so the row as published cannot be
               added to a bread the user picked without counting the loaf
               twice. Keyed on ID, not name: once sizes collapse into a family
               every member shares one name, and a name lookup would subtract
               an Originals bread from a BIGS sandwich.
  name_variants: [{pattern, sections?}] regex with named groups `family` and
               `label`, for a size family the source spells out in the row name
               ("2 count Original Chicken Dippers") rather than with a
               separator. Matching by pattern means a reworded row still groups.
  name_trim:   [{pattern, into, base_label?, labels?}] lift out of the printed
               name whatever is not the food. `into` is "serving" (the captured
               text becomes serving_desc), "drop" (discarded), or "size" (it
               becomes the size chip, and rows sharing the trimmed name collapse
               into one row carrying those chips).
               `base_label` names the chip for a row carrying no suffix, which
               is how a source says "regular". `labels` sets the chip ORDER and
               therefore the family HEAD -- and the head is what an unselected
               row quotes, so CAVA printing Kids first had a lemonade
               advertising 200 cal for a drink sold at 260. Always check it.
               Rules run in config order and each is anchored at the end, so
               list the outermost suffix first: "Hot BBQ - 2 fl oz - limited
               time" is a note on a portion on a name.
               Spell the alternatives out; never match "any parenthetical". One
               Potbelly table carries "(cup)" and "(for mac)", one Qdoba table
               "(4 oz)" and "(kids)".
  dedupe:      true to drop rows that became identical once the name was tidied
               -- a source printing the same dressing in its dips table and
               again in its dressings table. Same category, name, values, mode
               gating AND size chip; the survivor takes any portion the
               duplicate stated. The gating is part of the key on purpose:
               BWW republishes every sauce per wing tier with identical values.
  energy_exempt: validate.py only; components allowed to fail the
               calories-vs-macros check.

  --- items spec keys ---
  Beyond {cat, id, name, desc, skip, copies}:
    suffix / id_suffix   append " (X)" to the derived name / id
    size_mode            the mode this row activates when picked
    only_modes           the modes this row is visible under
    mode_selector        this row IS the format choice: one per mode, always
                         visible, and picking it activates its mode
    mode_names           mode id -> display name for a mode_selector row
    mode_variants        mode id -> {family, label}; collapses the modes of one
                         crust into a single row with a size selector. Works
                         only where the source reprints the row under ONE name
                         in every size's table (Papa John's "Original Crust").
    variant_family       the row names the family it joins, for sources that
                         name each size differently ("Bread - White",
                         "Bread - White, BIGS"). Members share `name`, which is
                         what the collapsed row displays.
    variant_of / variant_label  join a family explicitly / name this size chip
    addon_of             this row rides along with the component named, rather
                         than being an alternative to it (Domino's garlic oil
                         on a Hand Tossed crust). Stops a single-select
                         category from clearing its own parent.
    feature              lift into the "Make it a meal" shelf

  --- meta keys (copied wholesale to the output; see lib/schema.ts) ---
    size_modes, portion, glyph, formats, blurb, disclaimer_extra, menu_check
    consistency          per-check waivers for lib/consistency.test.ts, value
                         being the REASON. Undeclared drift from what a chain's
                         cuisine peers do fails CI; a declared difference
                         passes.

  --- category keys (lib/schema.ts) ---
    flow                 "preset" | "build" | "extras" | "both"
    in_preset            a named menu item already includes this, so the menu
                         path does not offer it (a bread, a bun, a size)
"""
import json, re, sys, unicodedata
from pathlib import Path

FIELDS = ["calories", "fat_g", "sat_fat_g", "trans_fat_g", "cholesterol_mg",
          "sodium_mg", "carbs_g", "fiber_g", "sugars_g", "protein_g"]
# "<5" as well as "<1": Jimmy John's declares cholesterol under the FDA's
# 5 mg threshold that way. Any bound is read as its midpoint, which is what
# "<1 -> 0.5" already did.
TOK = r"(?:-|<\d+(?:\.\d+)?|\d+(?:\.\d+)?)"

def slug(s):
    s = s.lower().replace("’", "").replace("'", "").replace("™", "").replace("®", "")
    # Fold accents so "Jalapeño" ids as jalapeno, not jalape-o.
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def num(x):
    if x == "-": return 0
    if x.startswith("<"): return float(x[1:]) / 2
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
    # Portion-tier tables (Jimmy John's ADD-ONS / FREEBIES): the chain prints
    # one block per item, one line per portion, and puts the item's name on
    # only ONE line of the block -- the middle one:
    #     EZ    15 0 0 ...
    #     Ham   REG   35 10 1 ...
    #     XTRA  70 15 1.5 ...
    # Give every line the block's name and its own tier, so each becomes an
    # ordinary "<name> <tier> <numbers>" row. `name_variants` then collapses
    # the three into one row with an EZ/REG/XTRA selector, exactly as it does
    # for a size family -- the tiers ARE portion sizes of one ingredient.
    tier_cfg = layout.get("tier_rows")
    if tier_cfg:
        tier_sec = re.compile(tier_cfg["sections"])
        tiers = tier_cfg["tiers"]
        alt = "|".join(re.escape(t) for t in tiers)
        tier_re = re.compile(rf"^(?P<name>.*?)\s*\b(?P<tier>{alt})\b\s+(?P<nums>[<\d].*)$")
        out, i, in_tier = [], 0, False
        while i < len(lines):
            if sec_re.match(lines[i]):
                in_tier = bool(tier_sec.match(lines[i]))
                out.append(lines[i]); i += 1; continue
            if not in_tier or not tier_re.match(lines[i]):
                out.append(lines[i]); i += 1; continue
            block = []
            while i < len(lines):
                m = tier_re.match(lines[i])
                if not m:
                    break
                block.append(m); i += 1
                # The last tier closes the block, so an item whose name sits on
                # a later line cannot absorb the next item's rows.
                if m.group("tier") == tiers[-1]:
                    break
            name = next((m.group("name").strip() for m in block if m.group("name").strip()), "")
            # Emit the default portion first so it becomes the variant family's
            # head: tapping the row should give you what the shop actually puts
            # on the sandwich, not the lightest option, which would understate
            # every meal built from it.
            head = tier_cfg.get("head")
            if head:
                block.sort(key=lambda m: m.group("tier") != head)
            for m in block:
                out.append(f"{name} {m.group('tier')} {m.group('nums')}".strip())
        lines = out

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
    # Display names for the size modes, so a row joining a size family
    # can label its chip with the chain's own word for that size without
    # repeating it in every items entry.
    mode_names = {m["id"]: m["name"] for m in cfg["meta"].get("size_modes", [])}
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
                # Qualify the family by the section's mode. Jimmy John's prints
                # the same add-on ladder once per bread size, so a single global
                # "addons/ham" family would make every later size point at the
                # first size's head -- and the head at itself.
                fam_mode = (cfg.get("section_modes", {}).get(f"{r.section}/{r.sub}")
                            or cfg.get("section_modes", {}).get(r.section or ""))
                if isinstance(fam_mode, dict):
                    fam_mode = fam_mode["id"]
                spec.setdefault("name", fam_txt)
                spec.setdefault("id", slug(r.printed))
                spec["variant_label"] = label
                fam = f"{spec.get('cat')}/{fam_mode or ''}/{slug(fam_txt)}"
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
        # A section may serve SEVERAL formats at once: Jimmy John's publishes
        # one add-on table for 8" French, Unwich, sliced wheat and both wraps,
        # because the portion is the same on all of them. Then the row is
        # visible under every one of those modes but its id is qualified by the
        # group, so the five formats do not each mint a duplicate.
        modes_visible = None
        if isinstance(mode, dict):
            modes_visible = list(mode["modes"])
            mode = mode["id"]
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
                c["only_modes"] = list(modes_visible or [mode])
                # A variant's head is per-mode too, so the reference has to be
                # qualified the same way or it points at a component that the
                # mode suffix has renamed out from under it.
                if sp.get("variant_of"):
                    sp = dict(sp, variant_of=f"{sp['variant_of']}-{mode}")
                # An add-on names the crust it is brushed onto, and that crust
                # is per-mode too, so the reference needs the same suffix.
                if sp.get("addon_of"):
                    sp = dict(sp, addon_of=f"{sp['addon_of']}-{mode}")
            if sp.get("size_mode"): c["size_mode"] = sp["size_mode"]
            if sp.get("only_modes"): c["only_modes"] = sp["only_modes"]
            if sp.get("variant_of"): c["variant_of"] = sp["variant_of"]
            if sp.get("addon_of"): c["addon_of"] = sp["addon_of"]
            if sp.get("variant_label"): c["variant_label"] = sp["variant_label"]
            # A size family the row names for itself.
            #
            # `mode_variants` above only works where the source reprints a row
            # under ONE name in every size's table -- Papa John's calls it
            # "Original Crust" whatever the size, so a single items entry can
            # map mode -> family. Potbelly prints "Bread - White",
            # "Bread - White, BIGS" and "Bread - White, Skinny": three separate
            # items entries that can never see each other, so instead each row
            # names the family it joins and they share a `name`, which is what
            # the collapsed row displays.
            #
            # Deliberately down here rather than in the mode_selector branch:
            # the size can come from a section mode (Potbelly) or straight off
            # the row (Jimmy John's 8"/16"/Little John), and both need it. Ids
            # are final by this point in either path, so the family head is a
            # reference that still resolves.
            if sp.get("variant_family") and not c.get("variant_of"):
                if not c.get("variant_label"):
                    c["variant_label"] = mode_names.get(c.get("size_mode"), c.get("size_mode"))
                fam = f"{c['category']}/{sp['variant_family']}"
                if fam in families:
                    c["variant_of"] = families[fam]
                else:
                    families[fam] = c["id"]
            if sp.get("feature"): c["feature"] = True
            c["_ord"] = base_ord + 0.001 * n
            c["_sec"] = r.section
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
    # A name should be the FOOD. Sources routinely cram three other things into
    # it -- the portion ("Asian Zing - 2 fl oz"), the size ("Ranch Dressing -
    # Large") and availability ("Black Garlic Glaze - limited time, at select
    # locations") -- while serving_desc sits on "1 serving" saying nothing. Each
    # rule lifts one of those out of the name and into the field it belongs to.
    #
    # Declared per chain rather than sniffed: a detector that guesses families
    # from name shape reads Domino's thirteen per-size cheese rows, all printed
    # "Regular", as one family of thirteen. `ingest/families.py` proposes these
    # rules; a person confirms them; the config records the outcome, so a
    # re-ingest stays byte-identical. Run AFTER the row loop so it sees the
    # finished names, and before section_subtract so its note reads the tidy one.
    #
    #   into="serving"  captured text becomes serving_desc
    #   into="drop"     captured text is discarded
    #   into="size"     captured text becomes the size chip, and rows sharing
    #                   the trimmed name become one row carrying those chips.
    #                   `base_label` names the chip for the row that carries no
    #                   suffix, which is how a source says "regular".
    trims = [dict(t, re=re.compile(t["pattern"], re.I)) for t in cfg.get("name_trim", [])]
    for c in comps:
        if c.get("variant_of") or c.get("addon_of"):
            continue
        # Every rule gets a turn, in config order, because a source stacks them:
        # "Hot BBQ - 2 fl oz - limited time" is a note on a portion on a name.
        # Each pattern anchors at the end, so peeling the note off first exposes
        # the portion to the next rule. List them outermost suffix first.
        for t in trims:
            m = t["re"].search(c["name"])
            if not m:
                continue
            got = (m.group(1) if m.groups() else m.group(0)).strip(" -–,")
            c["name"] = t["re"].sub("", c["name"]).strip(" -–,")
            if t["into"] == "serving" and got:
                c["serving_desc"] = got
            elif t["into"] == "size":
                # Capitalise an all-lowercase label so "(cup)" and ", Cup" read
                # as the same chip. Only when it IS all lowercase: title-casing
                # everything would turn Potbelly's BIGS into Bigs and 2 FL OZ
                # into 2 Fl Oz.
                c["variant_label"] = got.capitalize() if got.islower() else got
                # Remember which end it came off, so a label that has to be put
                # back goes back where it was: Subway prints '6" Buffalo
                # Chicken', and restoring that as 'Buffalo Chicken, 6"' is worse
                # than never having trimmed it.
                c["_label_pre"] = t["pattern"].startswith("^")
                # A size that is itself a measurement answers "how much?" too,
                # so a row still sitting on "1 serving" may as well say it.
                if (re.match(r"^\d", got)
                        and c["serving_desc"] in ("1 serving", "", None)):
                    c["serving_desc"] = got

    # Rows that became identical once the name was tidied. A source prints the
    # same dressing in its dips table and again in its dressings table; before
    # the trim above they read as different rows only because one name carried
    # "- 2 fl oz". Same category, same name, same numbers, same mode gating is
    # not two choices, it is one choice printed twice.
    #
    # Gating is part of the key on purpose: BWW republishes every sauce once per
    # wing tier with identical values and different `only_modes`, and collapsing
    # those would take the mode system with it.
    #
    # Runs BEFORE families are joined: a duplicate left in the list looks like a
    # third member with no size, and the family declines to form.
    if cfg.get("dedupe"):
        keep, first_of = [], {}
        for c in comps:
            k = (c["category"], c["name"].lower(),
                 tuple(sorted(c.get("only_modes") or [])), c.get("size_mode"),
                 c.get("variant_label"), tuple(c.get(f) for f in FIELDS))
            first = first_of.get(k)
            if first is None:
                first_of[k] = c
                keep.append(c)
                continue
            # The duplicate usually states the portion the first row left as
            # "1 serving"; that is the one fact it adds, so take it.
            if (first["serving_desc"] in ("1 serving", "", None)
                    and c["serving_desc"] not in ("1 serving", "", None)):
                first["serving_desc"] = c["serving_desc"]
        if len(keep) != len(comps):
            print(f"  dedupe: dropped {len(comps) - len(keep)} rows printed twice",
                  file=sys.stderr)
        comps = keep

    # Rows left sharing a name differ only by the size lifted out of it, so they
    # become one row carrying chips.
    if any(t["into"] == "size" for t in trims):
        base_label = next((t.get("base_label") for t in trims
                           if t["into"] == "size" and t.get("base_label")), None)
        sized = {}
        for c in comps:
            if c.get("variant_of") or c.get("addon_of"):
                continue
            sized.setdefault((c["category"], c["name"].lower()), []).append(c)
        # Which size heads the family, and the order its chips read in. Dump
        # order is not good enough: CAVA prints Kids first, so the family would
        # head on the kids cup and an unselected lemonade would quote 200
        # calories for a drink that is 260 as normally sold. Understating a
        # total by default is the one thing this site cannot do.
        order = next((t.get("labels") for t in trims
                      if t["into"] == "size" and t.get("labels")), None)
        for members in sized.values():
            # A family needs a real alternative: one row with a size suffix and
            # one without is Regular vs Large, but a lone row that happened to
            # carry a suffix is just a row.
            if len(members) < 2 or not any(m.get("variant_label") for m in members):
                continue
            if len({m.get("variant_label") for m in members}) != len(members):
                continue  # repeated labels mean these are separated by a mode
            for m in members:
                if not m.get("variant_label") and base_label:
                    m["variant_label"] = base_label
            if order:
                rank = {l.lower(): i for i, l in enumerate(order)}
                members.sort(key=lambda m: rank.get(
                    (m.get("variant_label") or "").lower(), len(rank)))
                # Rewrite the sort keys too, or the final sort puts them back.
                base_ord = min(m["_ord"] for m in members)
                for i, m in enumerate(members):
                    m["_ord"] = base_ord + 0.0001 * i
            head = members[0]
            for m in members:
                if m is not head:
                    m["variant_of"] = head["id"]

        # A size lifted off a row that turned out to have no siblings. The chip
        # would render alone, or not at all, and either way "Seasoned Rice"
        # silently stops saying it is a bowl. Put it back.
        for c in comps:
            if c.get("variant_label") and not c.get("variant_of") and \
                    not any(m.get("variant_of") == c["id"] for m in comps):
                lbl = c.pop("variant_label")
                c["name"] = (f"{lbl} {c['name']}" if c.get("_label_pre")
                             else f"{c['name']}, {lbl}")

    # Sections whose rows already BUNDLE a base component, named per section:
    # Potbelly's sandwich totals include white bread at that size, so the row as
    # published cannot be added to a bread the user picked without counting the
    # loaf twice. Subtracting the base leaves the fillings, which is arithmetic
    # on two of the chain's own figures -- the same standing as `derived`.
    # Keyed on the component's id, not its name: once sizes collapse into a
    # family every member shares one name, so a name lookup would return the
    # first size for all three sections and quietly subtract an Originals
    # bread from a BIGS sandwich. Ids stay unique per size.
    for sec, base_id in (cfg.get("section_subtract") or {}).items():
        base = next((c for c in comps if c["id"] == base_id), None)
        if base is None:
            print(f"  WARNING: section_subtract names unknown component {base_id!r}",
                  file=sys.stderr)
            continue
        label = base["name"]
        if base.get("variant_label"):
            label += f" ({base['variant_label']})"
        for c in comps:
            if c.get("_sec") != sec:
                continue
            for f in FIELDS:
                if c.get(f) is not None and base.get(f) is not None:
                    c[f] = max(0, round(c[f] - base[f], 2))
            c["derived"] = (f"{label} removed. The chain publishes this item "
                            f"including that bread, so it is subtracted here and "
                            f"you pick the bread yourself; both figures are the "
                            f"chain's own.")

    order = {c["id"]: i for i, c in enumerate(cfg["categories"])}
    comps.sort(key=lambda c: (order[c["category"]], c["_ord"]))  # category order, then items-table order
    for c in comps: c.pop("_ord", None); c.pop("_sec", None); c.pop("_label_pre", None)
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
