"""Usage: dump.py <slug> <pdf>  — pdfplumber text dump, page-delimited, to data/raw/<slug>/raw_dump.txt"""
import sys, pdfplumber
from pathlib import Path
slug, pdf = sys.argv[1], sys.argv[2]
out = Path(f"data/raw/{slug}/raw_dump.txt"); out.parent.mkdir(parents=True, exist_ok=True)
with pdfplumber.open(pdf) as p:
    out.write_text("\n".join(f"\n===== PAGE {i+1} =====\n" + (pg.extract_text() or "") for i, pg in enumerate(p.pages)))
    print(f"{len(p.pages)} pages -> {out}")
