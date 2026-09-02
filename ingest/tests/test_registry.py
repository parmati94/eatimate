"""The formats registry and the config vocabulary against the real configs."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ingest"))
from config_check import problems  # noqa: E402
from formats import FORMATS, dump_args, dumper_path, spec  # noqa: E402

CONFIGS = sorted((ROOT / "ingest" / "chains").glob("*.json"))


@pytest.mark.parametrize("path", CONFIGS, ids=[p.stem for p in CONFIGS])
def test_every_config_has_a_registered_format_whose_dumper_exists(path):
    src = json.loads(path.read_text())["meta"]["source"]
    entry = spec(src)
    d = dumper_path(src)
    assert d is None or d.exists()
    assert entry["refresh"] in ("asset", "redump", "manual")


@pytest.mark.parametrize("path", CONFIGS, ids=[p.stem for p in CONFIGS])
def test_every_config_uses_only_known_keys(path):
    assert problems(json.loads(path.read_text())) == []


def test_unknown_format_and_missing_keys_fail_loudly():
    with pytest.raises(KeyError):
        spec({"format": "carrier-pigeon"})
    with pytest.raises(KeyError):
        spec({"format": "sanity", "api_base": "x"})
    with pytest.raises(KeyError):
        spec({"format": "image", "pdf_url": "x", "link_pattern": "y"})  # not marked transcribed


def test_tables_flag_comes_from_the_config():
    assert dump_args({"format": "pdf", "pdf_url": "x", "tables": True}) == ["--tables"]
    assert dump_args({"format": "pdf", "pdf_url": "x"}) == []


def test_unknown_key_gets_a_hint():
    bad = problems({"meta": {"name": "x", "slug": "x", "source": {}}, "layout": {}, "categories": [],
                    "items": {"Row": {"cat": "a", "need": "b"}}})
    assert any("'need'" in b and "needs" in b for b in bad)


def test_registry_covers_every_dumper_on_disk():
    on_disk = {p.name for p in (ROOT / "ingest").glob("dump*.py")}
    registered = {e["dumper"] for e in FORMATS.values() if e["dumper"]}
    assert on_disk == registered
