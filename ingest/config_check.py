"""Reject a chain config that uses a key the pipeline does not read.

The app's schema (lib/schema.ts) is strict, so a stray key in data/chains
fails loudly. The config that PRODUCES that data was not checked at all: a
typo like "need" for "needs" was silently ignored, and the feature it was
meant to switch on simply did not appear. With sixty-odd knobs across five
levels, that is the most likely mistake a future edit makes.

This is the vocabulary, one set per level, taken from common.py's docstring
(which stays the reference for what each key MEANS). extract.py runs it before
reading anything. Add a key here the moment common.py learns to read it.
"""
import sys

TOP = {"meta", "layout", "categories", "items", "section_categories", "synthetic",
       "corrections", "name_trim", "section_modes", "mode_servings", "variant_split",
       "energy_exempt", "name_variants", "dedupe", "derived", "portion_split",
       "section_subtract"}

META = {"name", "slug", "source", "disclaimer_extra", "glyph", "formats", "blurb",
        "default_flow", "size_modes", "consistency", "menu_check", "portion"}

SOURCE = {"format", "fetch", "retrieved", "verified", "pdf_url", "html_url", "html_urls",
          "page_url", "link_pattern", "asset_sha256", "dump_sha256", "tables",
          "transcribed", "matrix", "plain_ua", "groups",
          # API-shaped sources
          "api_base", "dataset", "menu_id", "build_item", "menu_path", "headers",
          "skip_categories", "skip_ingredients"}

LAYOUT = {"columns", "serving", "sections", "subsections", "row_sections", "skip",
          "footer", "pre_replace", "stop", "start", "allergen", "floz_sections",
          "serving_brackets", "dual_split", "tier_rows", "dash_rows_are_data",
          "title_case"}

CATEGORY = {"id", "name", "select", "flow", "in_preset", "note", "role",
            "size_leads"}

# An items entry, and therefore also a section default (a dict there becomes
# the spec of every row it covers), plus the section-only knobs.
ITEM = {"cat", "id", "name", "desc", "skip", "copies", "suffix", "id_suffix",
        "size_mode", "only_modes", "mode_selector", "mode_names", "mode_variants",
        "variant_family", "variant_of", "variant_label", "addon_of", "feature",
        "needs"}
SECTION = ITEM | {"strict", "only"}

SYNTHETIC = {"id", "name", "cat", "desc", "before", "size_mode", "only_modes"}
DERIVED = {"id", "name", "cat", "desc", "values", "reason", "estimated", "after",
           "size_mode", "only_modes", "serving_desc"}
NAME_TRIM = {"pattern", "into", "base_label", "labels"}
NAME_VARIANT = {"pattern", "sections"}
TIER_ROWS = {"sections", "tiers", "head"}
PORTION_SPLIT = {"per", "unit", "categories", "whole", "reason"}
CORRECTION = {"field", "used", "reason"}
SIZE_MODE = {"id", "name", "note", "default", "multipliers", "portion_count"}
SECTION_MODE = {"id", "modes"}


def _unknown(where, d, allowed, out):
    if not isinstance(d, dict):
        out.append(f"{where}: expected an object")
        return
    for k in d:
        if k not in allowed:
            close = [a for a in allowed if a.startswith(k[:3]) or k.startswith(a[:3])]
            hint = f" (did you mean {', '.join(sorted(close))}?)" if close else ""
            out.append(f"{where}: unknown key {k!r}{hint}")


def problems(cfg):
    """Every unknown key in the config, as 'where: what' strings."""
    out = []
    _unknown("top level", cfg, TOP, out)
    meta = cfg.get("meta", {})
    _unknown("meta", meta, META, out)
    _unknown("meta.source", meta.get("source", {}), SOURCE, out)
    for i, m in enumerate(meta.get("size_modes") or []):
        _unknown(f"meta.size_modes[{i}]", m, SIZE_MODE, out)
    _unknown("layout", cfg.get("layout", {}), LAYOUT, out)
    tr = cfg.get("layout", {}).get("tier_rows")
    if tr:
        _unknown("layout.tier_rows", tr, TIER_ROWS, out)
    for i, c in enumerate(cfg.get("categories", [])):
        _unknown(f"categories[{i}]", c, CATEGORY, out)
    for k, v in cfg.get("items", {}).items():
        _unknown(f"items[{k!r}]", v, ITEM, out)
        for j, cp in enumerate(v.get("copies") or []) if isinstance(v, dict) else []:
            _unknown(f"items[{k!r}].copies[{j}]", cp, ITEM, out)
    for k, v in cfg.get("section_categories", {}).items():
        # null is legitimate: it names a section to drop (Potbelly's hidden
        # and kids tables), so its rows are consumed and emit nothing.
        if isinstance(v, dict):
            _unknown(f"section_categories[{k!r}]", v, SECTION, out)
        elif v is not None and not isinstance(v, str):
            out.append(f"section_categories[{k!r}]: expected a category id, an object or null")
    for k, v in cfg.get("section_modes", {}).items():
        if isinstance(v, dict):
            _unknown(f"section_modes[{k!r}]", v, SECTION_MODE, out)
    for i, s in enumerate(cfg.get("synthetic", [])):
        _unknown(f"synthetic[{i}]", s, SYNTHETIC, out)
    for i, d in enumerate(cfg.get("derived", [])):
        _unknown(f"derived[{i}]", d, DERIVED, out)
    for i, t in enumerate(cfg.get("name_trim", [])):
        _unknown(f"name_trim[{i}]", t, NAME_TRIM, out)
    for i, t in enumerate(cfg.get("name_variants", [])):
        _unknown(f"name_variants[{i}]", t, NAME_VARIANT, out)
    if cfg.get("portion_split"):
        _unknown("portion_split", cfg["portion_split"], PORTION_SPLIT, out)
    for cid, entries in cfg.get("corrections", {}).items():
        for i, e in enumerate(entries):
            _unknown(f"corrections[{cid!r}][{i}]", e, CORRECTION, out)
    # Cross-references that a typo would otherwise break silently.
    cats = {c.get("id") for c in cfg.get("categories", [])}
    for k, v in cfg.get("items", {}).items():
        if isinstance(v, dict) and "cat" in v and v["cat"] not in cats:
            out.append(f"items[{k!r}]: unknown category {v['cat']!r}")
        if isinstance(v, dict) and v.get("needs") and v["needs"] not in cats:
            out.append(f"items[{k!r}]: needs unknown category {v['needs']!r}")
    for k, v in cfg.get("section_categories", {}).items():
        if v is None or (isinstance(v, dict) and "skip" in v):
            continue          # dropped sections name no category
        cat = v.get("cat") if isinstance(v, dict) else v
        if cat not in cats:
            out.append(f"section_categories[{k!r}]: unknown category {cat!r}")
        if isinstance(v, dict) and v.get("needs") and v["needs"] not in cats:
            out.append(f"section_categories[{k!r}]: needs unknown category {v['needs']!r}")
    return out


def check(cfg, slug="config"):
    """Print every problem and exit 1 if there are any."""
    bad = problems(cfg)
    if bad:
        for b in bad:
            print(f"ERROR: {slug}: {b}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    import json
    from pathlib import Path
    paths = sys.argv[1:] or sorted(Path(__file__).parent.glob("chains/*.json"))
    total = 0
    for p in paths:
        p = Path(p)
        bad = problems(json.loads(p.read_text()))
        for b in bad:
            print(f"  {p.stem}: {b}")
        total += len(bad)
    print(f"{len(paths)} configs, {total} problems")
    sys.exit(1 if total else 0)
