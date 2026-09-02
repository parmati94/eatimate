"""Every source shape the pipeline reads, in one table.

Each chain's config names its shape in `meta.source.format`. This is the only
place that says what that shape MEANS: which dumper turns it into
data/raw/<slug>/raw_dump.txt, which config keys that dumper needs, what extra
arguments it takes from the config, and how refresh.py can tell whether the
source has changed.

It exists because the alternative was measured. Six dumpers were added one
chain at a time, and refresh.py kept its own four-entry map of them -- so the
two newest chains (Burger King, Whataburger) were routed to the wrong dumper,
a transcribed flyer (Little Caesars) had no strategy at all, and the flag two
PDF chains need (`--tables`) lived nowhere but the shell history. A registry
that every script reads cannot drift from itself.

    refresh:  "asset"   the source is a file at a URL; resolve the current
                        link from page_url, compare bytes, then compare the
                        re-dumped text where a dumper exists
              "redump"  no stable file; run the dumper again and compare the
                        text it produces
              "manual"  cannot be checked without a person (JS-rendered link,
                        a calculator with no export)
    dumper:   script in ingest/, or None where the dump was transcribed by
              hand and `source.transcribed` says so
    needs:    config keys the dumper reads; missing ones fail before any
              network request
    args:     extra command-line flags, read from the config
"""
from pathlib import Path

HERE = Path(__file__).parent

FORMATS = {
    "pdf": {
        "dumper": "dump.py", "refresh": "asset", "needs": ("pdf_url",),
        # pdfplumber's ruled-table mode, for guides whose rotated column
        # headers scramble the plain text order (Chopt, Just Salad).
        "args": lambda src: ["--tables"] if src.get("tables") else [],
    },
    # A page image transcribed by hand. Nothing can re-dump it, but the image
    # bytes can still be pinned, so a new flyer at least reads as "moved" or
    # "changed" instead of going unnoticed.
    "image": {"dumper": None, "refresh": "asset", "needs": ("pdf_url", "link_pattern")},
    "html_table": {"dumper": "dump_html.py", "refresh": "redump", "needs": ("html_url",)},
    "html_matrix": {"dumper": "dump_html.py", "refresh": "redump", "needs": ("html_url",)},
    "html_items": {"dumper": "dump_html.py", "refresh": "redump", "needs": ("html_url",)},
    # Structured JSON embedded in a page or served by an API (Chick-fil-A).
    "json": {"dumper": "dump_json.py", "refresh": "redump", "needs": ("html_url",)},
    # A Sanity CMS dataset queried with GROQ (Burger King).
    "sanity": {"dumper": "dump_sanity.py", "refresh": "redump",
               "needs": ("api_base", "dataset", "menu_id", "build_item")},
    # An ordering API that publishes ingredients and composes items from them
    # (Whataburger).
    "compose": {"dumper": "dump_compose.py", "refresh": "redump",
                "needs": ("api_base", "menu_path", "headers")},
    # A Nutritionix export captured from the chain's embedded calculator
    # (Potbelly). The export URL is minted per session, so it is re-captured
    # by hand.
    "nutritionix": {"dumper": "dump_nutritionix.py", "refresh": "manual", "needs": ()},
}


def spec(src):
    """The registry entry for a source block, or a loud failure."""
    fmt = src.get("format")
    if fmt not in FORMATS:
        raise KeyError(f"unknown source.format {fmt!r}; known: {', '.join(sorted(FORMATS))}")
    entry = FORMATS[fmt]
    missing = [k for k in entry["needs"] if not src.get(k)]
    if missing:
        raise KeyError(f"source.format {fmt!r} needs {missing} in meta.source")
    if entry["dumper"] is None and not src.get("transcribed"):
        raise KeyError(f"source.format {fmt!r} has no dumper; set source.transcribed: true "
                       f"to say the dump was written by hand")
    return entry


def dumper_path(src):
    """Absolute path of the dumper for this source, or None if transcribed."""
    entry = spec(src)
    return HERE / entry["dumper"] if entry["dumper"] else None


def dump_args(src):
    """Extra flags the dumper takes from the config, so a re-dump needs
    nothing remembered from the first one."""
    entry = spec(src)
    fn = entry.get("args")
    return fn(src) if fn else []
