"""No chain ships rows that are really one row with a size selector.

`families.py` has found these since it was written, but finding them was a
thing a person had to REMEMBER to run -- and on 2026-09-06 Taco Bell shipped
with three uncollapsed families (8 rows that should have been 3) because that
step was skipped on a new chain. Paul caught it, which is the wrong person to
be catching it.

So the detection is the same, and only the trigger changes: every chain, every
CI run, no remembering. A chain that genuinely has to keep a duplicate says so
in `meta.consistency.no_families` with a reason -- the same escape hatch
`no_presets` and `no_meal_shelf` already use, because the point is to force the
QUESTION, never to auto-collapse. Auto-collapsing is rejected on purpose: it
cannot tell a size from a mode (Domino's prints thirteen per-size cheese rows
all labelled "Regular") and it would break the pipeline's one promise, that the
same dump in gives byte-identical JSON out.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ingest"))
from families import dupes, families  # noqa: E402

SHIPPED = sorted((ROOT / "data" / "chains").glob("*.json"))


def _chain(path):
    return json.loads(path.read_text())


@pytest.mark.parametrize("path", SHIPPED, ids=[p.stem for p in SHIPPED])
def test_no_uncollapsed_size_families(path):
    d = _chain(path)
    if (d.get("consistency") or {}).get("no_families"):
        pytest.skip("chain records a reason for keeping these separate")
    found = families(d["components"])
    assert not found, (
        f"{path.stem}: {len(found)} size famil(ies) still printed as separate rows -- "
        + "; ".join(f"[{cat}] {fam!r}: {sorted(l for l, _ in v)}" for cat, fam, v in found)
        + ". Add a `name_variants` rule (with `labels`, so the family does not "
          "head on the smallest size), re-extract, or set "
          "meta.consistency.no_families with the reason."
    )


@pytest.mark.parametrize("path", SHIPPED, ids=[p.stem for p in SHIPPED])
def test_no_rows_printed_twice(path):
    d = _chain(path)
    if (d.get("consistency") or {}).get("no_families"):
        pytest.skip("chain records a reason for keeping these separate")
    found = dupes(d["components"])
    assert not found, (
        f"{path.stem}: {len(found)} row(s) printed twice with identical numbers: "
        + "; ".join(sorted({c["name"] for v in found for c in v})[:6])
        + ". Set `dedupe: true`, or meta.consistency.no_families with the reason."
    )
