"""Find rows a chain prints more than once, and propose the config to fold them.

A name should be the FOOD. Sources routinely cram three other things into it --
the portion ("Asian Zing - 2 fl oz"), the size ("Ranch Dressing - Large") and
availability ("Black Garlic Glaze - limited time") -- while serving_desc sits on
"1 serving" saying nothing. The result is a calculator listing the same dressing
three times.

`name_trim` in common.py lifts those out. This finds where to apply it.

REPORT ONLY, and deliberately so. The tempting version of this tool collapses
families automatically at ingest, and it is wrong twice over:

  * It cannot tell a size from a mode. Domino's prints thirteen per-size cheese
    rows all labelled "Regular"; read as a name family that is one row with
    thirteen identical chips. BWW does the same with twelve "Original" sauces.
    The filters below (labels must be distinct, gating must match) catch those,
    but only because a person chose them -- the naive version was confidently
    wrong on the two biggest chains in the set.
  * It would break the pipeline's one promise: same dump in, byte-identical
    JSON out. Families inferred from name shape change when a chain rewords a
    row, which silently reshapes ids and breaks links already shared -- on a
    re-ingest, exactly when the diff most needs to be readable.

So: this proposes, a person confirms, the chain's config records the outcome.
Same contract as refresh.py and menu_check.py -- neither writes anything.

Usage: families.py [slug ...]      (default: every chain)
"""
import collections
import json
import re
import sys
from pathlib import Path

CHAINS = Path(__file__).parent.parent / "data" / "chains"

PORTION = r"\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|tsp|tbsp|ml|g|inch|\"|ct|pc|piece)s?"
SIZE = (r"Extra Large|X-Large|Large|Small|Medium|Regular|Kids|Half|Whole|Mini|"
        r"BIGS|Skinny|Thin-Cut|Personal|Bowl|Cup|Side|Snack|Entree")
NOTE = r"limited time(?:,\s*at select locations)?|at select locations|seasonal|new"

# A suffix is separated by a dash, a comma, or parentheses -- Potbelly
# prints "Mac & Cheese, Cup" and "Broccoli Cheddar (cup)" in one table.
SUFFIX = re.compile(
    rf"^(?P<f>.+?)\s*(?:[-–,]\s*(?P<l>{SIZE}|{PORTION})|\((?P<l2>{SIZE}|{PORTION})\))\s*$",
    re.I)
VAGUE = ("1 serving", "", None)


def load(slug):
    return json.loads((CHAINS / f"{slug}.json").read_text())


def gate(c):
    """What decides whether this row is on screen. Two rows with different
    gating are never visible together, so they are not a repeat the user sees."""
    return (tuple(sorted(c.get("only_modes") or [])), c.get("size_mode"))


def families(comps):
    """Rows that differ only by a size or portion in the name."""
    g = collections.defaultdict(list)
    for c in comps:
        if c.get("variant_of") or c.get("addon_of"):
            continue  # already folded
        m = SUFFIX.match(c["name"])
        if m:
            g[(c["category"], m.group("f").strip().lower())].append(
                (m.group("l") or m.group("l2"), c))
        else:
            g[(c["category"], c["name"].strip().lower())].append((None, c))
    out = []
    for (cat, stem), v in g.items():
        if len(v) < 2 or not any(l for l, _ in v):
            continue
        labels = [l for l, _ in v]
        if len(set(labels)) != len(labels):
            continue  # repeated label => separated by a mode, not a size
        if len({gate(c) for _, c in v}) != 1:
            continue  # never on screen together
        if any(c.get("variant_label") for _, c in v):
            # Already the head of a family on another axis. Potbelly's "White
            # Bread" and "White Bread, Thin-Cut" each carry Original/BIGS/Skinny
            # chips; folding them would ask one chip row to express two
            # independent choices, and the row can only hold one.
            continue
        out.append((cat, stem, v))
    return sorted(out)


def portions(comps):
    """Rows carrying a portion in the name while serving_desc says nothing."""
    return [c for c in comps
            if re.search(rf"(?:[-–,]\s*|\()\s*{PORTION}\)?\s*$", c["name"], re.I)
            and c["serving_desc"] in VAGUE]


def notes(comps):
    return [c for c in comps if re.search(rf"[-–,]\s*(?:{NOTE})\s*$", c["name"], re.I)]


def dupes(comps):
    """The same row printed in two tables: same category, same name once any
    suffix is off, same numbers, same gating, same size chip.

    The chip is part of the key, and skipping variant members is not optional.
    Without either, Jimmy John's EZ / REG / XTRA freebies read as triplicates,
    because a cucumber is 0 calories at all three portions -- and folding them
    would delete the portion selector to remove a difference that is real but
    happens not to show up in the numbers."""
    g = collections.defaultdict(list)
    for c in comps:
        if c.get("variant_of"):
            continue  # already a member of a family, not a stray reprint
        stem = re.sub(rf"\s*[-–,]\s*(?:{SIZE}|{PORTION}|{NOTE})\s*$", "", c["name"], flags=re.I)
        g[(c["category"], stem.strip().lower(), gate(c), c.get("variant_label"),
           c["calories"], c.get("protein_g"), c.get("sodium_mg"))].append(c)
    return [v for v in g.values() if len(v) > 1]


# A suffix on a size label is a second question smuggled into the first.
SUFFIX_SPLIT = re.compile(r"\s+[-\u2013]\s+(.+)$")


def norm_suffix(t):
    """Fold a suffix to something comparable.

    Chick-fil-A's own chart prints "- no hash browns" five times and "- no hash
    brown" once, so exact matching splits one group of six into 5 + 1 and a
    threshold test quietly misses it. Singular/plural is the only difference
    seen, and it is the difference worth folding."""
    t = " ".join(t.lower().split())
    return re.sub(r"s\b", "", t)


def multiplied(comps):
    """Families that are two choices flattened into one list.

    Chick-fil-A's Hash Brown Scramble Bowl carries six proteins and then the
    same six again suffixed "- no hash browns": a protein choice multiplied by
    a hash-brown toggle. A chip row can hold one question, not two, so no
    styling rescues it -- it wants splitting in the data.

    The signal is a suffix shared by a large minority of the members. Measured
    across all 384 families in the set, it matched those two rows and nothing
    else -- Subway's 6"/Wrap/Salad/Protein Bowl and Chick-fil-A's cheese
    choices are each ONE question, however un-sizelike their labels read, and
    are correctly left alone."""
    kids = collections.defaultdict(list)
    for c in comps:
        if c.get("variant_of"):
            kids[c["variant_of"]].append(c)
    out = []
    for c in comps:
        members = [c] + kids.get(c["id"], [])
        if len(members) < 4:
            continue
        labels = [str(m.get("variant_label") or "") for m in members]
        sufs = collections.Counter()
        for l in labels:
            m = SUFFIX_SPLIT.search(l)
            if m:
                sufs[norm_suffix(m.group(1))] += 1
        if not sufs:
            continue
        suffix, n = sufs.most_common(1)[0]
        # A large minority, not a majority: the suffixed half is the second
        # answer, so it is at most half the list and often just under.
        if n >= 2 and n * 3 >= len(members):
            out.append((c, suffix, n, len(members)))
    return out


def suggest(fams, ports, nots):
    """The name_trim rules that would fold what was found, outermost suffix
    first -- a note sits outside a portion sits outside the name."""
    out = []
    if nots:
        out.append({"pattern": rf"\s*[-–,]\s*({NOTE})\s*$", "into": "drop"})
    if ports:
        out.append({"pattern": rf"\s*[-–,]\s*({PORTION})\s*$", "into": "serving"})
    seen = [l for _, _, v in fams for l, _ in v if l and not re.match(PORTION, l, re.I)]
    if seen:
        alts = "|".join(sorted({s.title() for s in seen}, key=len, reverse=True))
        out.append({"pattern": rf"\s*[-–,]\s*({alts})\s*$", "into": "size",
                    "base_label": "Regular"})
    return out


def report(slug):
    d = load(slug)
    comps = d["components"]
    fams, ports, nots, dup = families(comps), portions(comps), notes(comps), dupes(comps)
    saved = sum(len(v) - 1 for _, _, v in fams) + sum(len(v) - 1 for v in dup)
    mult = multiplied(comps)
    if not (fams or ports or nots or dup or mult):
        return 0
    print(f"\n{slug}  ({len(comps)} components)")
    if fams:
        print(f"  {len(fams)} size families -> {sum(len(v) for _, _, v in fams)} rows become {len(fams)}")
        for cat, stem, v in fams[:6]:
            print(f"      [{cat}] {stem!r}: {[l or '(base)' for l, _ in v]}")
        if len(fams) > 6:
            print(f"      ... and {len(fams) - 6} more")
    if ports:
        print(f"  {len(ports)} rows hide the portion in the name while serving_desc says nothing")
        for c in ports[:3]:
            print(f"      {c['name']!r}  serving_desc={c['serving_desc']!r}")
    if nots:
        print(f"  {len(nots)} rows carry an availability note in the name")
        for c in list({c['name']: c for c in nots}.values())[:3]:
            print(f"      {c['name']!r}")
    if dup:
        print(f"  {len(dup)} rows printed in more than one table (add \"dedupe\": true)")
        for v in dup[:3]:
            print(f"      {v[0]['name']!r} x{len(v)} in [{v[0]['category']}]")
    for c, suffix, n, total in multiplied(comps):
        print(f"  {c['name']!r} is TWO questions in one list: {total} members, "
              f"{n} of them suffixed \"- {suffix}\"")
        print(f"      A chip row holds one question. Split it in the data -- the "
              f"suffix is a separate choice -- or accept the long list knowingly.")
    rules = suggest(fams, ports, nots)
    if rules:
        print(f'  suggested for ingest/chains/{slug}.json:')
        print('    "name_trim": ' + json.dumps(rules, indent=6).replace("\n", "\n    "))
    print(f"  => would remove {saved} duplicate rows")
    return saved


def main():
    slugs = sys.argv[1:] or sorted(p.stem for p in CHAINS.glob("*.json"))
    total = sum(report(s) for s in slugs)
    print(f"\n{total} duplicate rows across {len(slugs)} chains.")
    print("Nothing was written. Add the rules above to a chain's config, then re-extract.")


if __name__ == "__main__":
    main()
