"""Usage: dump.py <slug> <pdf> [--tables]
Text dump, page-delimited, to data/raw/<slug>/raw_dump.txt.

--tables: use pdfplumber's ruled-table extraction (lines strategy) instead of
raw text. Emits, per table, the header's first cell as a section line followed
by "name  <numeric cells>" rows — this reconstructs names that wrap across
lines around the numbers (Just Salad). Non-numeric trailing cells (allergen
X marks) are dropped. Use when the raw text dump interleaves wrapped names.
"""
import re, sys, pdfplumber
from pathlib import Path

slug, pdf = sys.argv[1], sys.argv[2]
tables = "--tables" in sys.argv
out = Path(f"data/raw/{slug}/raw_dump.txt"); out.parent.mkdir(parents=True, exist_ok=True)
# A "no value" cell is written "-" by most chains and "--" by some (Chopt).
# Both have to count as a cell: dropping one shifts every later column left,
# which reads as data rather than as an error.
DASH = r"[-\u2013\u2014]{1,2}"
NUM = re.compile(rf"^(?:<1|{DASH}|\d+(?:\.\d+)?)$")

def norm(c): return re.sub(r"\s+", " ", (c or "")).strip()
def cell(c): return "-" if re.fullmatch(DASH, c) else c

with pdfplumber.open(pdf) as p:
    chunks = []
    for i, pg in enumerate(p.pages):
        if not tables:
            chunks.append(f"\n===== PAGE {i+1} =====\n" + (pg.extract_text() or "")); continue
        lines = [f"\n===== PAGE {i+1} ====="]
        # page-level headings (uppercase text outside any table) are emitted in
        # reading order before the table they sit above
        found = pg.find_tables({"vertical_strategy": "lines", "horizontal_strategy": "lines"})
        heads = [(l["top"], norm(l["text"])) for l in pg.extract_text_lines()
                 if norm(l["text"]).isupper() and not any(t.bbox[1] <= l["top"] <= t.bbox[3] for t in found)]
        cursor = 0
        for tb in sorted(found, key=lambda t: t.bbox[1]):
            for top, text in sorted(heads):
                if cursor <= top < tb.bbox[1]: lines.append(text)
            cursor = tb.bbox[3]
            for row in tb.extract():
                cells = [norm(c) for c in row]
                if not any(cells): continue
                name, rest = cells[0], cells[1:]
                # a leading non-numeric cell is the source's own serving size;
                # bracket it so layout.serving_brackets can lift it back off
                serving = rest[0] if rest and rest[0] and not NUM.match(rest[0]) else None
                if serving: rest = rest[1:]
                nums = [cell(c) for c in rest if NUM.match(c)]
                if len(nums) >= 6:
                    lines.append(f"{name}{f' [{serving}]' if serving else ''} {' '.join(nums)}")
                elif name and not nums and not any(NUM.match(c) for c in cells[1:]):
                    # header row: first cell is the section title (rest are rotated column labels)
                    lines.append(name)
        for top, text in sorted(heads):
            if top >= cursor: lines.append(text)
        chunks.append("\n".join(lines))
    out.write_text("\n".join(chunks) + "\n")
    print(f"{len(p.pages)} pages -> {out}{' (tables mode)' if tables else ''}")
