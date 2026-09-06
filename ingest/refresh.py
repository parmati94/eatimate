"""Check whether a chain's published source has moved or changed.

Usage: refresh.py <slug> | --all [--json]
       refresh.py --pull <slug>     carry the current source through to data/
       refresh.py --record <slug>   after a re-ingest, re-pin hashes + date

Reads meta.source from ingest/chains/<slug>.json and reports one of:

  ok        the recorded URL is still current and its content is unchanged
  unpinned  no hash recorded yet -- run --record; not a change
  manual    the link can only be resolved by hand (JS-rendered page)
  moved     the page now links a different asset (re-ingest from the new URL)
  changed   same URL, but the text we parse is different (re-ingest)
  reexport  same URL, bytes differ, extracted text identical (harmless)
  stale     the page no longer links the asset we recorded
  error     could not reach or resolve the source

Exit code 0 when every chain is ok/reexport, 1 otherwise, so a cron can
branch on it. Checking writes NOTHING -- it downloads a changed asset, parses
it to tell a re-export from a real edit, and restores what was there. The
three flags that DO write are --pull (ingest the change), --record (re-pin
hashes after one) and --touch,
which stamps source.verified with today's date on every chain that came back
ok or reexport, so overview.py's freshness table measures how long since the
source was last found unchanged rather than how long since it was fetched.

`source.fetch` picks how to reach the source, because no single client
works everywhere -- Five Guys 403s the scraper but answers plain requests,
CAVA and Moe's are the reverse:

  plain         ordinary request
  cloudscraper  Cloudflare-walled page
  redirect      page_url 302s straight at the current asset
  asset         no page; the asset URL is stable and replaced in place
  manual        the page renders its link with JS and mints a new URL per
                edition, so neither the page nor the asset can be diffed
                without a browser (Domino's). overview.py's freshness table
                is what catches these, by age rather than by change.

--pull <slug>  fetch the chain's CURRENT source and carry it through to
             data/chains: updates a moved url, downloads, dumps, extracts and
             re-pins the hashes. Stops and says so where a new row needs a
             config decision -- that is the one step it cannot make.
--serial     check one chain at a time (readable log when debugging one)
$REFRESH_TIMEOUT  seconds per request  (default 20)
$REFRESH_BUDGET   seconds per chain    (default 45)

`source.format` picks the strategy, via formats.py: an "asset" format (pdf,
image) is resolved and hashed; a "redump" format (html, json, sanity,
compose) is re-parsed and its text compared; a "manual" one is reported.
"""
import hashlib, json, os, re, subprocess, sys, tempfile, time, warnings
from pathlib import Path

from formats import dump_args, dumper_path, spec

warnings.filterwarnings("ignore")
CHAINS = Path(__file__).parent / "chains"
RAW = Path(__file__).parent.parent / "data" / "raw"
# Pages link assets protocol-relative as often as absolutely; Qdoba's whole
# nutrition guide was invisible to a pattern that insisted on a scheme. Images
# count too: Little Caesars publishes its chart as a JPG flyer.
PDF_RE = re.compile(r'(?:https?:)?//[^"\'\\ )<>]+\.(?:pdf|jpe?g|png)', re.I)


def norm_hash(text: str) -> str:
    """Hash of the parsed text, normalised -- a trailing newline is not a change."""
    body = "\n".join(l.rstrip() for l in text.splitlines()).strip() + "\n"
    return hashlib.sha256(body.encode()).hexdigest()


# A default python-requests UA is refused by several of these sites where an
# ordinary browser string is not; this is politeness, not evasion.
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"}


# One attempt's patience, and the whole chain's. Subway sits behind Akamai Bot
# Manager, which does not REFUSE urllib3 -- it accepts the connection and then
# never answers -- so a 90s timeout retried three times spent 4.5 minutes on
# one chain and was most of a five-minute sweep. A host that has not spoken in
# 20 seconds is not being slow, it is not going to answer; and the sweep has to
# stay short enough to run on a timer as the chain count grows.
TIMEOUT = int(os.environ.get("REFRESH_TIMEOUT", "20"))
BUDGET = int(os.environ.get("REFRESH_BUDGET", "45"))


class Budget(Exception):
    """This chain used its whole time budget. Reported, never silent."""


def get(url, how, tries=3, deadline=None):
    """Retry once or twice: some of these sites are simply slow, and a
    transient timeout reported as a change would be worse than useless. But
    retries stop at the deadline, so one wedged host cannot hold the sweep."""
    import time
    last = None
    for n in range(tries):
        if deadline and time.monotonic() > deadline:
            raise Budget(f"gave up after {BUDGET}s")
        try:
            if how == "cloudscraper":
                import cloudscraper
                return cloudscraper.create_scraper().get(url, timeout=TIMEOUT)
            import requests
            return requests.get(url, timeout=TIMEOUT, headers=UA, allow_redirects=True)
        except Exception as e:
            last = e
            if deadline and time.monotonic() + 2 * (n + 1) > deadline:
                break
            time.sleep(2 * (n + 1))
    raise last


def redump(slug, src, args=None):
    """Re-run the chain's own dumper and hash what it produced, restoring the
    working copy afterwards. The dumpers already know each chain's fetch
    quirks, so this reuses them rather than re-implementing the fetch. Which
    dumper, and which flags, come from the registry and the config."""
    keep = RAW / slug / "raw_dump.txt"
    saved = keep.read_text() if keep.exists() else None
    try:
        subprocess.run([sys.executable, str(dumper_path(src)), slug] + dump_args(src) + (args or []),
                       check=True, capture_output=True)
        return norm_hash(keep.read_text())
    finally:
        if saved is not None:
            keep.write_text(saved)


class Manual(Exception):
    """Not a failure: this chain simply cannot be checked without a browser."""


def resolve(src, deadline=None):
    """The asset URL the chain publishes right now, and how we know."""
    how = src.get("fetch", "plain")
    if how == "manual":
        raise Manual("link is JS-rendered; check by hand (see overview.py freshness)")
    if how == "asset":
        return src["pdf_url"], "asset url (no page)"
    if how == "redirect":
        r = get(src["page_url"], "plain", deadline=deadline)
        return r.url, f"redirect from {src['page_url']}"
    page = src.get("page_url")
    if not page:
        return src.get("pdf_url"), "no page recorded"
    r = get(page, how, deadline=deadline)
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
        return hits[0], f"{len(found)} assets on page, matched {pat!r}"
    return (src["pdf_url"] if src["pdf_url"] in found else found[0]), f"{len(found)} pdfs on page"


def check(slug):
    src = json.loads((CHAINS / f"{slug}.json").read_text())["meta"]["source"]
    out = {"chain": slug, "state": "error", "note": ""}
    deadline = time.monotonic() + BUDGET
    recorded = src.get("pdf_url") or src.get("html_url")
    try:
        entry = spec(src)
    except KeyError as e:
        out["note"] = str(e)
        return out
    if entry["refresh"] == "manual" or src.get("fetch") == "manual":
        out.update(state="manual", note="cannot be checked without a person "
                   "(see overview.py freshness)")
        return out
    if entry["refresh"] == "redump":
        try:
            live = redump(slug, src)
        except subprocess.CalledProcessError as e:
            err = (e.stderr or b"").decode(errors="replace").strip().splitlines()
            out["note"] = f"re-dump failed: {err[-1][:80] if err else e}"
            return out
        except Exception as e:
            out["note"] = f"re-dump failed: {type(e).__name__}: {str(e)[:60]}"
            return out
        if not src.get("dump_sha256"):
            out.update(state="unpinned", note="re-parsed; no hash recorded -- run --record")
            return out
        same = live == src["dump_sha256"]
        out.update(state="ok" if same else "changed",
                   note="page re-parsed; text " + ("identical" if same else "DIFFERS"))
        return out
    try:
        live, how = resolve(src, deadline)
        out["note"] = how
    except Manual as e:
        out.update(state="manual", note=str(e))
        return out
    except Budget as e:
        out.update(state="slow", note=str(e))
        return out
    except Exception as e:
        out["note"] = f"{type(e).__name__}: {str(e)[:70]}"
        return out

    out["live"] = live
    if live != recorded:
        out.update(state="moved", note=f"{how}; now {live}")
        return out

    try:
        body = get(live, "plain" if src.get("fetch") == "redirect" else src.get("fetch", "plain"),
                   deadline=deadline).content
    except Exception as e:
        out["note"] = f"fetching asset: {type(e).__name__}"
        return out

    if not src.get("asset_sha256") and not src.get("dump_sha256"):
        # A newly added chain has nothing to compare against yet. Saying
        # "changed" here would be a lie that trains you to ignore the tool.
        out.update(state="unpinned", note=f"{how}; no hash recorded -- run --record")
        return out

    if hashlib.sha256(body).hexdigest() == src.get("asset_sha256"):
        out.update(state="ok", note=f"{how}; bytes identical")
        return out

    # Bytes differ. That is usually a re-export, so compare what we actually
    # parse before calling it a change (Qdoba re-exports without editing). A
    # transcribed source has no dumper to do that with, so bytes are the word.
    if not src.get("dump_sha256") or entry["dumper"] is None:
        out.update(state="changed", note=f"{how}; bytes differ")
        return out
    with tempfile.TemporaryDirectory() as td:
        pdf = Path(td) / "live.pdf"
        pdf.write_bytes(body)
        keep = RAW / slug / "raw_dump.txt"
        saved = keep.read_text() if keep.exists() else None
        try:
            subprocess.run([sys.executable, str(dumper_path(src)), slug, str(pdf)] + dump_args(src),
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
    from urllib.parse import urlparse
    cp = CHAINS / f"{slug}.json"
    cfg = json.loads(cp.read_text()); src = cfg["meta"]["source"]
    src["dump_sha256"] = norm_hash((RAW / slug / "raw_dump.txt").read_text())
    assets = [f for f in glob.glob(str(RAW / slug / "*"))
              if not re.search(r"raw_dump|report|\.txt$", os.path.basename(f))]
    if assets:
        # Prefer the file the recorded URL actually names. The runbook says to
        # keep the previous guide alongside the new one, and some chains publish
        # a second document (Chopt ships a seasonal insert next to the main
        # guide) -- so "newest by mtime" can pin a hash for a file this chain
        # never parses, and refresh.py then cries "changed" forever.
        want = os.path.basename(urlparse(src.get("pdf_url") or "").path)
        # By name, or by suffix: a CDN prefixes the file it serves with an
        # upload id ("1779298904-...-page-001.jpg") that the local copy drops.
        named = [f for f in assets if os.path.basename(f) == want
                 or (want and want.endswith(os.path.basename(f)))]
        pick = named[0] if named else max(assets, key=os.path.getmtime)
        src["asset_sha256"] = hashlib.sha256(Path(pick).read_bytes()).hexdigest()
    src["retrieved"] = datetime.date.today().isoformat()
    cp.write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + "\n")
    print(f"  {slug}: hashes re-pinned, retrieved={src['retrieved']}"
          f"{' (no source file kept)' if not assets else ''}")
    print("  now re-run extract.py so the shipped retrieved date matches")


def pull(slug):
    """Take the chain's CURRENT source and carry it all the way to shipped data.

    refresh.py already downloads a changed asset and runs the dumper on it, to
    tell a re-export from a real edit -- and then throws all of it away, on
    purpose. This keeps it, which is the only difference between detecting a
    change and ingesting one, and collapses six mechanical steps into one:

        edit pdf_url if it moved -> download -> dump -> extract -> re-record
        -> extract again so the shipped `retrieved` date matches

    The seventh step is the one it CANNOT do: when a chain adds a row that no
    section default or items entry covers, extract aborts by design, and
    somebody has to say what that row is. That is reported, loudly, with the
    tree left as it is so the new dump can be read -- reverting is one git
    checkout and the message says so.
    """
    import datetime
    cp = CHAINS / f"{slug}.json"
    cfg = json.loads(cp.read_text())
    src = cfg["meta"]["source"]
    entry = spec(src)
    r = check(slug)
    print(f"  {slug}: {r['state'].upper()} — {r['note'][:100]}")
    if r["state"] in ("ok", "reexport"):
        print("     source is unchanged; nothing to pull")
        return r["state"]
    if r["state"] == "manual":
        print("     cannot be fetched without a person; fetch it and run "
              f"{entry['dumper']} {slug} <file> by hand")
        return "manual"
    if r["state"] not in ("changed", "moved", "unpinned"):
        print("     not a state worth pulling; fix the error first")
        return r["state"]

    # A moved asset is the chain publishing at a new URL. Record it BEFORE
    # fetching, so the config and the bytes on disk can never disagree.
    live = r.get("live")
    if r["state"] == "moved" and live:
        key = "pdf_url" if src.get("pdf_url") else "html_url"
        print(f"     {key}: {src.get(key)}\n              -> {live}")
        src[key] = live
        cp.write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + "\n")

    raw = RAW / slug
    raw.mkdir(parents=True, exist_ok=True)
    before = (raw / "raw_dump.txt").read_text() if (raw / "raw_dump.txt").exists() else None
    if entry["refresh"] == "redump":
        # These dumpers fetch for themselves.
        subprocess.run([sys.executable, str(dumper_path(src)), slug] + dump_args(src),
                       check=True, capture_output=True)
    else:
        body = get(src.get("pdf_url") or src["html_url"],
                   "plain" if src.get("fetch") == "redirect" else src.get("fetch", "plain")).content
        # Keep the source file: --record hashes it, and a guide we can no
        # longer download is a guide we can no longer prove anything about.
        name = "source.pdf" if body[:4] == b"%PDF" else "source.html"
        (raw / name).write_bytes(body)
        print(f"     fetched {len(body):,}b -> data/raw/{slug}/{name}")
        subprocess.run([sys.executable, str(dumper_path(src)), slug, str(raw / name)] + dump_args(src),
                       check=True, capture_output=True)
    after = (raw / "raw_dump.txt").read_text()
    if before is not None and norm_hash(before) == norm_hash(after):
        print("     dump is identical after all; nothing further to do")
        return "ok"

    ex = subprocess.run([sys.executable, "ingest/extract.py", slug], capture_output=True, text=True)
    if ex.returncode != 0:
        tail = [l for l in (ex.stdout + ex.stderr).splitlines() if l.strip()][-3:]
        print("     EXTRACT FAILED — this is the judgement call, not a bug:")
        for l in tail:
            print(f"       {l[:150]}")
        print(f"     the new dump is left in place so it can be read;"
              f" revert with:\n       git checkout -- data/raw/{slug}/raw_dump.txt ingest/chains/{slug}.json")
        return "needs-config"

    record(slug)                      # re-pin hashes and the retrieved date
    subprocess.run([sys.executable, "ingest/extract.py", slug], capture_output=True)
    return "pulled"


def touch(slugs):
    """Stamp source.verified = today on chains found unchanged. The date is
    carried into data/chains by the next extract, so it has to be followed by
    rebuild.py -- which --check will insist on."""
    import datetime
    today = datetime.date.today().isoformat()
    for slug in slugs:
        cp = CHAINS / f"{slug}.json"
        cfg = json.loads(cp.read_text())
        if cfg["meta"]["source"].get("verified") == today:
            continue
        cfg["meta"]["source"]["verified"] = today
        cp.write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + "\n")
    if slugs:
        print(f"  verified={today} stamped on {len(slugs)} chains; run rebuild.py to carry it into data/chains")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--pull" in sys.argv:
        if not args:
            sys.exit("usage: refresh.py --pull <slug> [slug...]")
        done = {}
        for slug in args:
            done[slug] = pull(slug)
        print()
        for slug, st in done.items():
            print(f"  {slug:<15} {st}")
        sys.exit(0 if all(v in ("pulled", "ok", "manual") for v in done.values()) else 1)
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
    # Checked in parallel, because the sweep is almost entirely waiting on
    # other people's servers and one slow host used to hold up all the rest.
    # Same shape as gsc.py's index_states: a small pool, well under anything
    # that would look like pressure on a single site -- and every chain here is
    # a DIFFERENT site, so the pool never sends two requests to one host at
    # once. Serial on request, for a readable log while debugging one chain.
    if len(slugs) > 1 and "--serial" not in sys.argv:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=8) as pool:
            rows = list(pool.map(check, slugs))
    else:
        rows = [check(s) for s in slugs]
    if "--touch" in sys.argv:
        touch([r["chain"] for r in rows if r["state"] in ("ok", "reexport")])
    if as_json:
        print(json.dumps(rows, indent=1))
    else:
        for r in rows:
            print(f"  {r['chain']:14} {r['state'].upper():9} {r['note'][:96]}")
        bad = [r for r in rows if r["state"] not in ("ok", "reexport", "unpinned", "manual")]
        print(f"\n{len(rows) - len(bad)}/{len(rows)} current" +
              (f"; needs attention: {', '.join(r['chain'] for r in bad)}" if bad else ""))
    sys.exit(1 if any(r["state"] not in ("ok", "reexport", "unpinned", "manual") for r in rows) else 0)


if __name__ == "__main__":
    main()
