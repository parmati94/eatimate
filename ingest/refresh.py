"""Check whether a chain's published source has moved or changed.

Usage: refresh.py <slug> | --all [--json]
       refresh.py --record <slug>   after a re-ingest, re-pin hashes + date

Reads meta.source from ingest/chains/<slug>.json and reports one of:

  ok        the recorded URL is still current and its content is unchanged
  moved     the page now links a different asset (re-ingest from the new URL)
  changed   same URL, but the text we parse is different (re-ingest)
  reexport  same URL, bytes differ, extracted text identical (harmless)
  stale     the page no longer links the asset we recorded
  error     could not reach or resolve the source

Exit code 0 when every chain is ok/reexport, 1 otherwise, so a cron can
branch on it. Nothing is written: this only reports.

`source.fetch` picks how to reach the source, because no single client
works everywhere -- Five Guys 403s the scraper but answers plain requests,
CAVA and Moe's are the reverse:

  plain         ordinary request
  cloudscraper  Cloudflare-walled page
  redirect      page_url 302s straight at the current asset
  asset         no page; the asset URL is stable and replaced in place
"""
import hashlib, json, re, subprocess, sys, tempfile, warnings
from pathlib import Path

warnings.filterwarnings("ignore")
CHAINS = Path(__file__).parent / "chains"
RAW = Path(__file__).parent.parent / "data" / "raw"
# Pages link assets protocol-relative as often as absolutely; Qdoba's whole
# nutrition guide was invisible to a pattern that insisted on a scheme.
PDF_RE = re.compile(r'(?:https?:)?//[^"\'\\ )<>]+\.pdf')


def norm_hash(text: str) -> str:
    """Hash of the parsed text, normalised -- a trailing newline is not a change."""
    body = "\n".join(l.rstrip() for l in text.splitlines()).strip() + "\n"
    return hashlib.sha256(body.encode()).hexdigest()


# A default python-requests UA is refused by several of these sites where an
# ordinary browser string is not; this is politeness, not evasion.
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"}


def get(url, how, tries=3):
    """Retry once or twice: some of these sites (Subway) are simply slow, and a
    transient timeout reported as a change would be worse than useless."""
    import time
    last = None
    for n in range(tries):
        try:
            if how == "cloudscraper":
                import cloudscraper
                return cloudscraper.create_scraper().get(url, timeout=90)
            import requests
            return requests.get(url, timeout=90, headers=UA, allow_redirects=True)
        except Exception as e:
            last = e
            time.sleep(2 * (n + 1))
    raise last


DUMPERS = {"json": "dump_json.py", "html_table": "dump_html.py",
           "html_matrix": "dump_html.py", "html_items": "dump_html.py"}


def redump(slug, fmt, args=None):
    """Re-run the chain's own dumper and hash what it produced, restoring the
    working copy afterwards. The dumpers already know each chain's fetch
    quirks, so this reuses them rather than re-implementing the fetch."""
    keep = RAW / slug / "raw_dump.txt"
    saved = keep.read_text() if keep.exists() else None
    try:
        subprocess.run([sys.executable, str(Path(__file__).parent / DUMPERS[fmt])] + [slug] + (args or []),
                       check=True, capture_output=True)
        return norm_hash(keep.read_text())
    finally:
        if saved is not None:
            keep.write_text(saved)


def resolve(src):
    """The asset URL the chain publishes right now, and how we know."""
    how = src.get("fetch", "plain")
    if how == "asset":
        return src["pdf_url"], "asset url (no page)"
    if how == "redirect":
        r = get(src["page_url"], "plain")
        return r.url, f"redirect from {src['page_url']}"
    page = src.get("page_url")
    if not page:
        return src.get("pdf_url"), "no page recorded"
    r = get(page, how)
    if r.status_code != 200:
        raise RuntimeError(f"page {r.status_code}")
    found = sorted({("https:" + u if u.startswith("//") else u)
                    for u in PDF_RE.findall(r.text)})
    if not found:
        raise RuntimeError("no pdf links on page")
    pat = src.get("link_pattern")
    if pat:
        # Every one of these pages links several PDFs -- BWW alone offers a
        # nutrition guide, an allergen guide, an ingredient list and a
        # soybean-oil notice. Without the pattern everything reads as "moved".
        hits = [u for u in found if re.search(pat, u)]
        if not hits:
            raise RuntimeError(f"no link matching {pat!r} among {len(found)}")
        return hits[0], f"{len(found)} pdfs on page, matched {pat!r}"
    return (src["pdf_url"] if src["pdf_url"] in found else found[0]), f"{len(found)} pdfs on page"


def check(slug):
    src = json.loads((CHAINS / f"{slug}.json").read_text())["meta"]["source"]
    out = {"chain": slug, "state": "error", "note": ""}
    recorded = src.get("pdf_url") or src.get("html_url")
    fmt = src.get("format", "pdf")
    if fmt in DUMPERS:
        try:
            same = redump(slug, fmt) == src.get("dump_sha256")
        except Exception as e:
            out["note"] = f"re-dump failed: {type(e).__name__}: {str(e)[:60]}"
            return out
        out.update(state="ok" if same else "changed",
                   note="page re-parsed; text " + ("identical" if same else "DIFFERS"))
        return out
    try:
        live, how = resolve(src)
        out["note"] = how
    except Exception as e:
        out["note"] = f"{type(e).__name__}: {e}"
        return out

    if live != recorded:
        out.update(state="moved", note=f"{how}; now {live}")
        return out

    try:
        body = get(live, "plain" if src.get("fetch") == "redirect" else src.get("fetch", "plain")).content
    except Exception as e:
        out["note"] = f"fetching asset: {type(e).__name__}"
        return out

    if hashlib.sha256(body).hexdigest() == src.get("asset_sha256"):
        out.update(state="ok", note=f"{how}; bytes identical")
        return out

    # Bytes differ. That is usually a re-export, so compare what we actually
    # parse before calling it a change (Qdoba re-exports without editing).
    if not src.get("dump_sha256") or src.get("format") != "pdf":
        out.update(state="changed", note=f"{how}; bytes differ")
        return out
    with tempfile.TemporaryDirectory() as td:
        pdf = Path(td) / "live.pdf"
        pdf.write_bytes(body)
        keep = RAW / slug / "raw_dump.txt"
        saved = keep.read_text() if keep.exists() else None
        try:
            subprocess.run([sys.executable, str(Path(__file__).parent / "dump.py"), slug, str(pdf)],
                           check=True, capture_output=True)
            live_dump = norm_hash(keep.read_text())
        finally:
            if saved is not None:
                keep.write_text(saved)          # never disturb the working tree
    same = live_dump == src["dump_sha256"]
    out.update(state="reexport" if same else "changed",
               note=f"{how}; bytes differ, text {'identical' if same else 'DIFFERS'}")
    return out


def record(slug):
    """Re-pin a chain's hashes and retrieved date after a re-ingest.

    Doing this by hand is the step that gets forgotten, and forgetting it
    makes refresh.py cry "changed" forever until you stop believing it."""
    import datetime, glob, os
    cp = CHAINS / f"{slug}.json"
    cfg = json.loads(cp.read_text()); src = cfg["meta"]["source"]
    src["dump_sha256"] = norm_hash((RAW / slug / "raw_dump.txt").read_text())
    assets = [f for f in glob.glob(str(RAW / slug / "*"))
              if not re.search(r"raw_dump|report|\.txt$", os.path.basename(f))]
    if assets:
        newest = max(assets, key=os.path.getmtime)
        src["asset_sha256"] = hashlib.sha256(Path(newest).read_bytes()).hexdigest()
    src["retrieved"] = datetime.date.today().isoformat()
    cp.write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + "\n")
    print(f"  {slug}: hashes re-pinned, retrieved={src['retrieved']}"
          f"{' (no source file kept)' if not assets else ''}")
    print("  now re-run extract.py so the shipped retrieved date matches")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--record" in sys.argv:
        if not args:
            sys.exit("usage: refresh.py --record <slug>")
        for slug in args:
            record(slug)
        return
    as_json = "--json" in sys.argv
    slugs = sorted(p.stem for p in CHAINS.glob("*.json")) if "--all" in sys.argv else args
    if not slugs:
        sys.exit(__doc__)
    rows = [check(s) for s in slugs]
    if as_json:
        print(json.dumps(rows, indent=1))
    else:
        for r in rows:
            print(f"  {r['chain']:14} {r['state'].upper():9} {r['note'][:96]}")
        bad = [r for r in rows if r["state"] not in ("ok", "reexport")]
        print(f"\n{len(rows) - len(bad)}/{len(rows)} current" +
              (f"; needs attention: {', '.join(r['chain'] for r in bad)}" if bad else ""))
    sys.exit(1 if any(r["state"] not in ("ok", "reexport") for r in rows) else 0)


if __name__ == "__main__":
    main()
