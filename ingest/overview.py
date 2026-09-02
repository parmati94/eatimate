#!/usr/bin/env python3
"""Usage: overview.py

Where chains differ, in two tables. The app-facing files are uniform -- same
schema, same required fields, one code path -- so all per-chain variety lives
either in optional fields (presentation) or in the ingest config (extraction),
and neither is easy to see by reading one file at a time.
"""
import glob
import json


def presentation():
    print("PRESENTATION — which optional fields a chain uses (data/chains/*.json)\n")
    print(f"  {'chain':<14}{'presets':<9}{'modes':<7}{'feature':<9}{'variants':<10}{'single-cats':<12}shape")
    print("  " + "-" * 92)
    for f in sorted(glob.glob("data/chains/*.json")):
        d = json.load(open(f))
        presets = sum(1 for c in d["categories"] if c.get("flow") == "preset")
        modes = len(d.get("size_modes") or [])
        feat = sum(1 for c in d["components"] if c.get("feature"))
        fams = len({c["variant_of"] for c in d["components"] if c.get("variant_of")})
        singles = sum(1 for c in d["categories"] if c["select"] == "single")
        shape = []
        if presets: shape.append("preset fork")
        if modes: shape.append("format-first")
        if feat: shape.append("meal step")
        if not shape: shape.append("plain ingredient list")
        print(f"  {d['slug']:<14}{presets or '-':<9}{modes or '-':<7}{feat or '-':<9}"
              f"{fams or '-':<10}{singles or '-':<12}{' + '.join(shape)}")


def extraction():
    print("\n\nEXTRACTION — knobs in ingest/chains/*.json (never reaches the app)\n")
    print(f"  {'chain':<14}{'format':<13}{'new rows':<11}{'sec_cats':<10}{'items':<8}special")
    print("  " + "-" * 92)
    for f in sorted(glob.glob("ingest/chains/*.json")):
        d = json.load(open(f))
        lay, meta, src = d.get("layout", {}), d["meta"], d["meta"]["source"]
        special = []
        if lay.get("pre_replace"): special.append(f"pre_replace x{len(lay['pre_replace'])}")
        for k, tag in (("stop", "stop"), ("subsections", "subsections")):
            if lay.get(k): special.append(tag)
        if d.get("section_modes"): special.append("section_modes")
        for k in ("plain_ua", "matrix", "groups"):
            if src.get(k): special.append(k)
        if src.get("html_urls"): special.append(f"{len(src['html_urls'])} pages")
        secs = len(d.get("section_categories", {}))
        # Whether a NEW menu item aborts the run or is quietly absorbed into a
        # section's default category. Historical accident, not a decision.
        behaviour = "absorbed" if secs else "ERRORS"
        print(f"  {meta['slug']:<14}{src.get('format', '?'):<13}{behaviour:<11}"
              f"{secs or '-':<10}{len(d.get('items', {})) or '-':<8}{', '.join(special) or '-'}")


def uniformity():
    chains = [json.load(open(f)) for f in sorted(glob.glob("data/chains/*.json"))]
    fields = [n["field"] for n in json.load(open("lib/nutrients.json"))["fields"]]
    req = ["id", "name", "category", "serving_desc", "serving_g"] + fields
    missing = {c["slug"] for c in chains
               for comp in c["components"] if any(k not in comp for k in req)}
    print(f"\n\n{len(chains)} chains, "
          f"{sum(len(c['components']) for c in chains)} components. "
          f"All required fields present: {not missing}"
          + (f" (MISSING in {sorted(missing)})" if missing else ""))


def freshness():
    """How old each chain's data is. Refresh detection is deferred, so this is
    the thing that makes staleness visible without anyone remembering to look:
    a chain can sit on a quietly superseded guide for years (Qdoba's did)."""
    import datetime
    today = datetime.date.today()
    rows = []
    for f in sorted(glob.glob("data/chains/*.json")):
        c = json.load(open(f))
        got = datetime.date.fromisoformat(c["source"]["retrieved"])
        # `verified` is the last time refresh.py --touch found the source
        # unchanged; a chain checked every week is not a year old because it
        # was fetched a year ago.
        seen = c["source"].get("verified")
        seen = datetime.date.fromisoformat(seen) if seen else got
        rows.append((c["slug"], got, seen, (today - max(got, seen)).days))
    print("\n\nFRESHNESS — age since the source was fetched (retrieved) or last found unchanged (verified)\n")
    print(f"  {'chain':14}{'retrieved':12}{'verified':12}{'age':>7}")
    print("  " + "-" * 52)
    for slug, got, seen, age in sorted(rows, key=lambda r: -r[3]):
        mark = "  STALE" if age > 180 else ("  ageing" if age > 90 else "")
        print(f"  {slug:14}{got.isoformat():12}{(seen.isoformat() if seen != got else '-'):12}{age:>5}d{mark}")
    old = [r for r in rows if r[3] > 180]
    print(f"\n  oldest {max(r[3] for r in rows)}d"
          + (f"; past 180d: {', '.join(r[0] for r in old)}" if old
             else "; nothing past 180d"))


if __name__ == "__main__":
    presentation()
    extraction()
    uniformity()
    freshness()
