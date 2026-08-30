"""Usage: extract.py <slug>   — data/raw/<slug>/raw_dump.txt -> data/chains/<slug>.json
All chain-specific knowledge lives in ingest/chains/<slug>.json. See common.py."""
import sys
from common import build, cff_corrections, finish, load_config, parse_dump

slug = sys.argv[1]
cfg = load_config(slug)
rows, pending = parse_dump(f"data/raw/{slug}/raw_dump.txt", cfg["layout"])
components = build(cfg, rows)
fixed = cff_corrections(components, rows)
if fixed: print(f"  corrections (fat from cal-from-fat): {fixed}", file=sys.stderr)
finish(cfg, components, rows, pending)
