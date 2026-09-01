#!/usr/bin/env python3
"""Capture the data a client-rendered page fetches for itself.

Usage:
    capture.py <url> [--out DIR] [--match REGEX] [--wait MS] [--min BYTES]
    capture.py <url> --slug <slug>          # out defaults to data/raw/<slug>/

Many chains render nutrition in the browser from an XHR rather than serving it
in the HTML, so `curl` gets a shell and the real payload is invisible. This
opens the page in Chromium, records every JSON response it makes, and writes
each to a file. It is the manual step behind Chipotle's live menu, Jimmy John's
product API and the Potbelly survey, made repeatable.

It REPORTS, never ingests: the files land in data/raw/ for a human to look at
before any config is written. Feed a good one to dump_json.py.

    --match     only keep responses whose URL matches this regex
    --min       ignore bodies smaller than this (default 2000; skips config blobs)
    --wait      extra ms to idle after load, for lazily-fetched menus (default 5000)
    --headed    show the browser, for pages needing a click or a store choice

Before capturing it prints what the site's robots.txt says, both for the
generic `*` agent and for named crawlers, because that is a fact worth seeing
rather than a footnote. Whether a given fetch is appropriate is the caller's
call to make with that in front of them.
"""
import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def robots_report(url: str) -> None:
    base = "{0.scheme}://{0.netloc}".format(urllib.parse.urlparse(url))
    try:
        req = urllib.request.Request(base + "/robots.txt",
                                     headers={"User-Agent": "Mozilla/5.0"})
        txt = urllib.request.urlopen(req, timeout=20).read().decode("utf8", "replace")
    except Exception as e:
        print(f"  robots.txt: could not read ({type(e).__name__})")
        return
    groups, agent = {}, None
    for line in txt.splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        k, _, v = line.partition(":")
        k, v = k.strip().lower(), v.strip()
        if k == "user-agent":
            agent = v
            groups.setdefault(agent, [])
        elif k in ("disallow", "allow") and agent is not None:
            groups[agent].append(f"{k}: {v or '(empty)'}")
    star = groups.get("*", [])
    print(f"  robots.txt for {base}:")
    print(f"    *            {', '.join(star) or '(no rules)'}")
    named = [a for a in groups if a != "*" and groups[a]]
    if named:
        print(f"    named agents {', '.join(sorted(named))}")
        for a in sorted(named):
            if re.search(r"claude|anthropic|gptbot|ccbot", a, re.I):
                print(f"      {a}: {', '.join(groups[a])}")


def main() -> None:
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("url")
    ap.add_argument("--out")
    ap.add_argument("--slug")
    ap.add_argument("--match")
    ap.add_argument("--wait", type=int, default=5000)
    ap.add_argument("--min", type=int, default=2000)
    ap.add_argument("--headed", action="store_true")
    if len(sys.argv) == 1 or "-h" in sys.argv or "--help" in sys.argv:
        sys.exit(__doc__)
    a = ap.parse_args()

    out = Path(a.out or (f"data/raw/{a.slug}" if a.slug else "data/raw/capture"))
    out.mkdir(parents=True, exist_ok=True)
    robots_report(a.url)

    from playwright.sync_api import sync_playwright

    keep, seen = [], set()
    want = re.compile(a.match) if a.match else None
    NUTRIENT = re.compile(r'"?(calorie|protein|sodium|totalfat|saturated|carbohydrate)', re.I)

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=not a.headed)
        pg = br.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"))

        def on_response(r):
            try:
                if "json" not in (r.headers.get("content-type") or ""):
                    return
                if want and not want.search(r.url):
                    return
                body = r.text()
            except Exception:
                return
            if len(body) < a.min or r.url in seen:
                return
            seen.add(r.url)
            # A key called "calories" proves nothing; a VALUE is what matters.
            try:
                doc = json.loads(body)
            except ValueError:
                return
            flat = json.dumps(doc)
            has_key = bool(NUTRIENT.search(flat))
            nums = len(re.findall(r'"[^"]*(?:calorie|protein|sodium)[^"]*"\s*:\s*[0-9]', flat, re.I))
            keep.append({"url": r.url, "bytes": len(body), "body": body,
                         "keys": has_key, "values": nums})

        pg.on("response", on_response)
        print(f"  loading {a.url}")
        try:
            pg.goto(a.url, wait_until="networkidle", timeout=60000)
        except Exception as e:
            print(f"  (load did not settle: {type(e).__name__}; keeping what arrived)")
        pg.wait_for_timeout(a.wait)
        br.close()

    if not keep:
        print("  no JSON responses captured. Try --wait 15000, a looser --min, "
              "or --headed if the page needs a click or a store chosen.")
        sys.exit(1)

    print(f"\n  {len(keep)} JSON response(s), largest first:")
    for i, k in enumerate(sorted(keep, key=lambda x: -x["bytes"]), 1):
        name = re.sub(r"[^a-z0-9]+", "-", urllib.parse.urlparse(k["url"]).path.lower()).strip("-") or "response"
        path = out / f"{name[:60]}-{i}.json"
        path.write_text(k["body"])
        # populated values, not just field names: today a menu API advertised
        # basecalories on all 233 items and every one of them was null.
        verdict = (f"{k['values']} populated nutrient values" if k["values"]
                   else "nutrient KEYS but no values" if k["keys"] else "no nutrition")
        print(f"    {k['bytes']:>9,}b  {verdict:32} {path}")
        print(f"               {k['url'][:96]}")


if __name__ == "__main__":
    main()
