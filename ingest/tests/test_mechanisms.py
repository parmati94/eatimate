"""Fixture tests for common.py: a ten-line dump and a minimal config per
mechanism, asserting the exact components out.

Each mechanism was added for one chain and nothing proved the others still
worked when it was touched. These are small on purpose -- the real chains are
covered by rebuild.py --check, which re-extracts every tracked dump and fails
on any byte that moved. This file is for the reasoning, that one is for the
data.
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import (FIELDS, build, cff_corrections, finish, manual_corrections,  # noqa: E402
                    parse_dump, slug, title_case)

COLS = list(FIELDS)
BASE_LAYOUT = {"columns": COLS, "serving": None, "sections": r"^[A-Z][A-Z &/:-]+$"}


def row(name, cal=100, fat=5, sat=1, trans=0, chol=10, sod=200, carb=10, fib=2, sug=3, prot=8):
    return f"{name} {cal} {fat} {sat} {trans} {chol} {sod} {carb} {fib} {sug} {prot}"


def cfg(categories, layout=None, **top):
    c = {"meta": {"name": "Test", "slug": "test",
                  "source": {"format": "pdf", "pdf_url": "https://x/y.pdf",
                             "retrieved": "2026-01-01", "fetch": "plain"}},
         "categories": [{"id": i, "name": i.title(), "select": "multi"} if isinstance(i, str) else i
                        for i in categories],
         "layout": {**BASE_LAYOUT, **(layout or {})}}
    c.update(top)
    return c


def run(tmp_path, text, config):
    dump = tmp_path / "raw_dump.txt"
    dump.write_text(text.strip() + "\n")
    rows, pending = parse_dump(str(dump), config["layout"])
    comps = build(config, rows)
    cff_corrections(comps, rows)          # the same two passes extract.py runs
    manual_corrections(config, comps)
    finish(config, comps, rows, pending, out_dir=str(tmp_path))
    return json.loads((tmp_path / "test.json").read_text())["components"]


# --- rows, sections, items -------------------------------------------------

def test_section_default_and_dump_order(tmp_path):
    out = run(tmp_path, f"""
PROTEINS
{row('Chicken', cal=150)}
{row('Steak', cal=200)}
TOPPINGS
{row('Salsa', cal=20)}
""", cfg(["toppings", "proteins"], section_categories={"PROTEINS": "proteins", "TOPPINGS": "toppings"}))
    # Category order comes from the config, row order from the dump.
    assert [(c["id"], c["category"], c["calories"]) for c in out] == [
        ("salsa", "toppings", 20), ("chicken", "proteins", 150), ("steak", "proteins", 200)]
    assert out[0]["serving_desc"] == "1 serving" and out[0]["serving_g"] is None


def test_items_entry_replaces_section_default(tmp_path):
    out = run(tmp_path, f"""
PROTEINS
{row('Chicken')}
{row('Water', cal=0)}
""", cfg(["proteins", "drinks"], section_categories={"PROTEINS": "proteins"},
         items={"Water": {"cat": "drinks", "id": "h2o", "name": "Still Water", "desc": "1 bottle"}}))
    w = next(c for c in out if c["id"] == "h2o")
    assert (w["category"], w["name"], w["serving_desc"]) == ("drinks", "Still Water", "1 bottle")


def test_repeated_name_addressed_by_section_or_occurrence(tmp_path):
    out = run(tmp_path, f"""
SAUCES
{row('BBQ Sauce', cal=40)}
DIPS
{row('BBQ Sauce', cal=90)}
""", cfg(["sauces", "dips"], items={"SAUCES/BBQ Sauce": {"cat": "sauces"},
                                     "BBQ Sauce [#2]": {"cat": "dips", "id": "bbq-dip"}}))
    assert {(c["id"], c["category"], c["calories"]) for c in out} == {
        ("bbq-sauce", "sauces", 40), ("bbq-dip", "dips", 90)}


def test_unconsumed_row_fails_loudly(tmp_path):
    with pytest.raises(SystemExit):
        run(tmp_path, f"""
PROTEINS
{row('Chicken')}
{row('Mystery Item')}
""", cfg(["proteins"], items={"Chicken": {"cat": "proteins"}}))


def test_skip_consumes_a_row(tmp_path):
    out = run(tmp_path, f"""
PROTEINS
{row('Chicken')}
{row('Napkin')}
""", cfg(["proteins"], items={"Chicken": {"cat": "proteins"}, "Napkin": {"skip": "not food"}}))
    assert [c["id"] for c in out] == ["chicken"]


def test_only_list_and_strict_section(tmp_path):
    out = run(tmp_path, f"""
DRINKS
{row('Coke')}
{row('Obscure Soda')}
PIZZA SAUCES
{row('BBQ Sauce', cal=30)}
DIPS
{row('BBQ Sauce', cal=90)}
""", cfg(["drinks", "sauces", "dips"],
         section_categories={"DRINKS": {"cat": "drinks", "only": ["Coke"]},
                             "PIZZA SAUCES": {"cat": "sauces", "strict": True},
                             "DIPS": "dips"},
         items={"BBQ Sauce": {"cat": "dips", "id": "bbq-dip"}}))
    ids = {(c["id"], c["category"]) for c in out}
    # The strict section keeps its own default despite the items entry; the
    # dips section takes it. The obscure soda is trimmed by the only-list.
    assert ids == {("coke", "drinks"), ("bbq-sauce", "sauces"), ("bbq-dip", "dips")}


# --- cells -----------------------------------------------------------------

def test_dash_is_zero_except_cholesterol_and_lt_is_half(tmp_path):
    out = run(tmp_path, f"""
SIDES
Fries 300 <1 - 0 - 400 40 3 <5 4
""", cfg(["sides"], section_categories={"SIDES": "sides"}))
    f = out[0]
    assert (f["fat_g"], f["sat_fat_g"], f["cholesterol_mg"], f["sugars_g"]) == (0.5, 0, None, 2.5)


def test_serving_in_name_and_gram_column(tmp_path):
    layout = {"columns": ["serving"] + COLS, "serving": "g"}
    out = run(tmp_path, f"""
PROTEINS
Grilled Steak (3.5 oz.) 99 {row('', cal=150).strip()}
Chicken 113 {row('', cal=150).strip()}
""", cfg(["proteins"], layout=layout, section_categories={"PROTEINS": "proteins"}))
    steak, chicken = out
    assert (steak["name"], steak["serving_desc"], steak["serving_g"]) == ("Grilled Steak", "3.5 oz", 99)
    assert (chicken["serving_desc"], chicken["serving_g"]) == ("113 g", 113)


def test_serving_brackets_and_title_case(tmp_path):
    out = run(tmp_path, f"""
SALADS
{row('KALE CAESAR with chicken [1 salad]')}
""", cfg(["salads"], layout={"serving_brackets": True, "title_case": True},
         section_categories={"SALADS": "salads"}))
    assert (out[0]["name"], out[0]["serving_desc"]) == ("Kale Caesar with chicken", "1 salad")
    assert title_case("BBQ CHICKEN") == "Bbq Chicken" and slug("Jalapeño™") == "jalapeno"


def test_wrapped_name_joins_around_the_numbers(tmp_path):
    out = run(tmp_path, f"""
BOWLS
Very Long Bowl Name
{row('').strip()}
That Wrapped
{row('Plain Bowl')}
""", cfg(["bowls"], section_categories={"BOWLS": "bowls"}))
    assert [c["name"] for c in out] == ["Very Long Bowl Name That Wrapped", "Plain Bowl"]


# --- families and sizes -----------------------------------------------------

def test_variant_split_collapses_sizes_into_one_row(tmp_path):
    out = run(tmp_path, f"""
SIDES
{row('Cheesesticks / 10"', cal=300)}
{row('Cheesesticks / 14"', cal=600)}
""", cfg(["sides"], section_categories={"SIDES": "sides"}, variant_split=" / "))
    head, member = out
    assert (head["name"], head["variant_label"], "variant_of" in head) == ("Cheesesticks", '10"', False)
    assert (member["variant_of"], member["variant_label"], member["calories"]) == (head["id"], '14"', 600)


def test_name_variants_group_by_pattern(tmp_path):
    out = run(tmp_path, f"""
WINGS
{row('2 count Dippers', cal=100)}
{row('4 count Dippers', cal=200)}
""", cfg(["wings"], section_categories={"WINGS": "wings"},
         name_variants=[{"pattern": r"^(?P<label>\d+ count) (?P<family>.+)$"}]))
    assert out[0]["name"] == "Dippers" and out[1]["variant_of"] == out[0]["id"]
    assert [c["variant_label"] for c in out] == ["2 count", "4 count"]


def test_name_trim_size_with_base_label_and_ordered_head(tmp_path):
    out = run(tmp_path, f"""
DRINKS
{row('Lemonade - Kids', cal=200)}
{row('Lemonade', cal=260)}
{row('Lemonade - Large', cal=400)}
{row('Tea - Large', cal=10)}
""", cfg(["drinks"], section_categories={"DRINKS": "drinks"},
         name_trim=[{"pattern": r"\s*-\s*(Kids|Large)\s*$", "into": "size",
                     "base_label": "Regular", "labels": ["Regular", "Large", "Kids"]}]))
    fam = [c for c in out if c["name"] == "Lemonade"]
    # Regular heads the family (an unselected row quotes its head), Kids last.
    assert [c["variant_label"] for c in fam] == ["Regular", "Large", "Kids"]
    assert fam[0]["calories"] == 260 and all(c["variant_of"] == fam[0]["id"] for c in fam[1:])
    # A lone suffixed row gets its size put back rather than a chip of one.
    tea = next(c for c in out if c["name"].startswith("Tea"))
    assert tea["name"] == "Tea, Large" and "variant_label" not in tea


def test_name_trim_serving_and_drop_then_dedupe(tmp_path):
    out = run(tmp_path, f"""
DIPS
{row('Ranch - 2 fl oz', cal=200)}
DRESSINGS
{row('Ranch - limited time', cal=200)}
""", cfg(["dips"], section_categories={"DIPS": "dips", "DRESSINGS": "dips"},
         name_trim=[{"pattern": r"\s*-\s*(limited time)\s*$", "into": "drop"},
                    {"pattern": r"\s*-\s*(\d+ fl oz)\s*$", "into": "serving"}],
         dedupe=True))
    assert len(out) == 1 and (out[0]["name"], out[0]["serving_desc"]) == ("Ranch", "2 fl oz")


def test_tier_rows_head_the_default_portion(tmp_path):
    layout = {"tier_rows": {"sections": "^FREEBIES$", "tiers": ["EZ", "REG", "XTRA"], "head": "REG"}}
    out = run(tmp_path, f"""
FREEBIES
EZ {row('', cal=5).strip()}
Onion REG {row('', cal=10).strip()}
XTRA {row('', cal=20).strip()}
""", cfg(["freebies"], layout=layout, section_categories={"FREEBIES": "freebies"},
         name_variants=[{"pattern": r"^(?P<family>.+?)\s+(?P<label>EZ|REG|XTRA)$"}]))
    assert [(c["variant_label"], c["calories"]) for c in out] == [("REG", 10), ("EZ", 5), ("XTRA", 20)]
    assert out[0]["name"] == "Onion" and out[1]["variant_of"] == out[0]["id"]


def test_dual_split_reads_two_sizes_from_one_row(tmp_path):
    layout = {"dual_split": {"PIZZAS": ["Small", "Large"]}}
    out = run(tmp_path, """
PIZZAS
Cheese 370/740 10/20 5/10 0 20/40 800/1600 40/80 2/4 3/6 15/30
""", cfg(["pizzas"], layout=layout, section_categories={"PIZZAS": "pizzas"}, variant_split=" / "))
    assert [(c["name"], c["variant_label"], c["calories"], c["trans_fat_g"]) for c in out] == [
        ("Cheese", "Small", 370, 0), ("Cheese", "Large", 740, 0)]
    assert out[1]["variant_of"] == out[0]["id"]


def test_section_modes_and_mode_selector(tmp_path):
    c = cfg(["format", "bread"], section_categories={"SIX INCH": "bread", "FOOTLONG": "bread"},
            section_modes={"SIX INCH": "six", "FOOTLONG": "foot"},
            items={"Italian": {"cat": "format", "mode_selector": True,
                               "mode_names": {"six": '6" Italian', "foot": "Footlong Italian"}}})
    c["meta"]["size_modes"] = [{"id": "six", "name": '6"', "multipliers": {"bread": 1}},
                               {"id": "foot", "name": "Footlong", "multipliers": {"bread": 2}}]
    out = run(tmp_path, f"""
SIX INCH
{row('Italian', cal=200)}
{row('Wheat', cal=210)}
FOOTLONG
{row('Italian', cal=400)}
{row('Wheat', cal=420)}
""", c)
    by = {x["id"]: x for x in out}
    assert by["italian-six"]["size_mode"] == "six" and by["italian-foot"]["name"] == "Footlong Italian"
    assert by["wheat-six"]["only_modes"] == ["six"] and by["wheat-foot"]["calories"] == 420
    assert "only_modes" not in by["italian-six"]  # a selector is always visible


# --- arithmetic on the chain's own figures -------------------------------------

def test_section_subtract_removes_the_bundled_base(tmp_path):
    out = run(tmp_path, f"""
BREADS
{row('White', cal=200, carb=40)}
SANDWICHES
{row('Turkey on White', cal=500, carb=50)}
""", cfg(["bread", "sandwiches"], section_categories={"BREADS": "bread", "SANDWICHES": "sandwiches"},
         section_subtract={"SANDWICHES": "white"}))
    t = next(c for c in out if c["category"] == "sandwiches")
    assert (t["calories"], t["carbs_g"]) == (300, 10) and t["derived"].startswith("White removed")


def test_portion_split_divides_the_whole_item(tmp_path):
    out = run(tmp_path, f"""
PIZZAS
{row('Pepperoni', cal=1600, sod=3200)}
""", cfg(["pizzas"], section_categories={"PIZZAS": "pizzas"},
         portion_split={"per": 8, "unit": "slice", "whole": "pizza", "categories": ["pizzas"],
                        "reason": "published per pizza, divided by the 8 slices the chain states"}))
    p = out[0]
    assert (p["calories"], p["sodium_mg"], p["serving_desc"]) == (200, 400, "1 slice (8 per pizza)")


def test_manual_and_cff_corrections_record_what_was_printed(tmp_path):
    layout = {"columns": COLS + ["cff"]}
    c = cfg(["mains"], layout=layout, section_categories={"MAINS": "mains"},
            corrections={"coke-zero": [{"field": "carbs_g", "used": 0, "reason": "0 kcal and 0 g sugar agree"}]})
    out = run(tmp_path, f"""
MAINS
Quesabirria 380 95 10 0 50 900 30 2 3 20 180
Coke Zero 0 0 0 0 0 40 66 0 0 0 0
""", c)
    q, z = out
    assert q["fat_g"] == 20 and q["corrections"][0]["printed"] == 95
    assert z["carbs_g"] == 0 and z["corrections"][0] == {
        "field": "carbs_g", "printed": 66, "used": 0, "reason": "0 kcal and 0 g sugar agree"}


def test_synthetic_before_and_derived_after(tmp_path):
    out = run(tmp_path, f"""
BASES
{row('Rice', cal=200)}
{row('Beans', cal=150)}
""", cfg(["bases"], section_categories={"BASES": "bases"},
         synthetic=[{"id": "no-base", "name": "No base", "cat": "bases", "desc": "none", "before": "rice"}],
         derived=[{"id": "half-rice", "name": "Half rice", "cat": "bases", "after": "rice",
                   "values": {f: 0 for f in COLS} | {"calories": 100},
                   "reason": "half of the published rice"}]))
    assert [c["id"] for c in out] == ["no-base", "rice", "half-rice", "beans"]
    assert out[0]["synthetic"] is True and out[2]["derived"] == "half of the published rice"


def test_needs_flows_from_section_default_to_component(tmp_path):
    out = run(tmp_path, f"""
SALADS
{row('Kale Caesar')}
WRAPS
{row('Chicken Wrap')}
""", cfg(["menu", "dressings"], section_categories={
        "SALADS": {"cat": "menu", "desc": "1 salad, no dressing", "needs": "dressings"},
        "WRAPS": "menu"}))
    salad, wrap = out
    assert (salad["needs"], salad["serving_desc"]) == ("dressings", "1 salad, no dressing")
    assert "needs" not in wrap


def test_same_dump_same_bytes(tmp_path):
    text = f"""
PROTEINS
{row('Chicken')}
"""
    a = run(tmp_path, text, cfg(["proteins"], section_categories={"PROTEINS": "proteins"}))
    b = run(tmp_path, text, cfg(["proteins"], section_categories={"PROTEINS": "proteins"}))
    assert json.dumps(a) == json.dumps(b)
