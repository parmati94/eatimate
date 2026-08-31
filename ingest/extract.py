"""Usage: extract.py <slug>   — data/raw/<slug>/raw_dump.txt -> data/chains/<slug>.json
All chain-specific knowledge lives in ingest/chains/<slug>.json. See common.py."""
import sys
from common import (build, cff_corrections, finish, load_config,
                    manual_corrections, parse_dump)

slug = sys.argv[1]
cfg = load_config(slug)
rows, pending = parse_dump(f"data/raw/{slug}/raw_dump.txt", cfg["layout"])
components = build(cfg, rows)
fixed = cff_corrections(components, rows)
if fixed: print(f"  corrections (fat from cal-from-fat): {fixed}", file=sys.stderr)
manual = manual_corrections(cfg, components)
if manual: print(f"  corrections (declared in config): {manual}", file=sys.stderr)
finish(cfg, components, rows, pending)
