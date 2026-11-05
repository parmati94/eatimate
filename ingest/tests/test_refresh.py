"""The two ways a source went wrong during the November 2026 refresh."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dump_sanity  # noqa: E402
import refresh  # noqa: E402


class FakeResponse:
    def __init__(self, status):
        self.status_code = status
        self.ok = status < 400
        self.content = b"<!doctype html>not a pdf"


def test_a_dead_asset_is_an_error_row_not_a_crash(monkeypatch):
    # Einstein Bros' page still links a PDF that now 404s with an HTML body.
    # Parsing that as a PDF raised, and took every other chain's result with it.
    url = "https://example.com/guide.pdf"
    monkeypatch.setattr(refresh, "resolve", lambda src, deadline: (url, "linked"))
    monkeypatch.setattr(refresh, "get", lambda *a, **k: FakeResponse(404))
    monkeypatch.setattr(refresh.json, "loads", lambda _: {"meta": {"source": {
        "format": "pdf", "pdf_url": url, "asset_sha256": "x", "dump_sha256": "y"}}})
    r = refresh.check("cava")
    assert r["state"] == "error"
    assert "404" in r["note"]


def test_a_modifier_with_sodium_but_no_calories_is_still_an_ingredient():
    group = {"mods": [
        {"mult": 0, "nut": {"sodium": 0}},
        {"mult": 1, "nut": {"calories": None, "sodium": 320}},
        {"mult": 1.5, "nut": {"calories": None, "sodium": 480}},
    ]}
    assert [m["nut"]["sodium"] for m in dump_sanity.regular_portions(group)] == [320]


def test_a_preparation_choice_is_not_an_ingredient():
    group = {"mods": [{"mult": 1, "nut": {"calories": None, "sodium": None}}]}
    assert dump_sanity.regular_portions(group) == []
