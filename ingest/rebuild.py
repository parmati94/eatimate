#!/usr/bin/env python3
"""Usage: rebuild.py [--check]

Re-runs extract.py for every chain in ingest/chains/ from the raw dumps already
on disk, so the generated data/chains/*.json always matches the configs that
produced them.

--check  don't rebuild; fail if any chain is out of date. Editing a config and
         forgetting to re-extract leaves the app serving something the config no
         longer describes, and nothing else notices.
"""
import subprocess
import sys
from pathlib import Path

slugs = sorted(p.stem for p in Path("ingest/chains").glob("*.json"))
check = "--check" in sys.argv

missing, rebuilt, failed = [], [], []
for slug in slugs:
    if not Path(f"data/raw/{slug}/raw_dump.txt").exists():
        missing.append(slug)
        continue
    r = subprocess.run([sys.executable, "ingest/extract.py", slug],
                       capture_output=True, text=True,
                       env={**__import__("os").environ, "PYTHONPATH": "ingest"})
    (rebuilt if r.returncode == 0 else failed).append(slug)
    if r.returncode != 0:
        print(f"  {slug}: {r.stdout.strip() or r.stderr.strip()}")

print(f"rebuilt {len(rebuilt)}/{len(slugs)} chains")
if missing:
    print(f"  SKIPPED (no raw dump on disk): {', '.join(missing)}")
if failed:
    sys.exit(f"  FAILED: {', '.join(failed)}")

drift = subprocess.run(["git", "diff", "--name-only", "--", "data/chains"],
                       capture_output=True, text=True).stdout.split()
if drift:
    print("  REGENERATED FILES DIFFER FROM HEAD — commit these:")
    for f in drift:
        print(f"    {f}")
    if check:
        sys.exit("  a config was edited without re-extracting; rebuild and commit")
elif check:
    print("  all chains match their configs")
