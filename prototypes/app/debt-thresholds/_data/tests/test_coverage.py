"""Tests for the coverage rows and report.

The report is rendered from a synthetic build of all 58 countries, not from the
inputs behind the baseline coverage.md, so these tests pin its structure and
exact lines for one small case.
"""

from datetime import date

from pipeline.config import views
from pipeline.countries import COUNTRIES
from pipeline.coverage import coverage_rows, listed, render_coverage

TODAY = date(2026, 11, 16)
VIEWS = views(TODAY, current_ids="November 2026")


def built_for(view_base: int, *, gap: str | None = None) -> dict[str, dict]:
    """A build with every series present, except GDP for `gap`."""
    built = {}
    for country in COUNTRIES:
        built[country.iso3] = {
            "debtFace": 1.0,
            "debtPV": 1.0,
            "gdp": None if country.iso3 == gap else 1.0,
            "capacity": {} if country.iso3 != "BTN" else None,
            "years": [
                {"year": view_base, "service": 1.0, "revenue": 1.0, "projected": False},
                {"year": view_base + 1, "service": 1.0, "revenue": None, "projected": True},
            ],
        }
    return built


def test_coverage_rows_flags_missing_core_series() -> None:
    view = VIEWS[0]
    rows = coverage_rows(built_for(view.base, gap="KEN"), view)
    assert len(rows) == len(COUNTRIES)
    kenya = next(r for r in rows if r["iso3"] == "KEN")
    assert kenya["missing"] == ["GDP"]
    assert kenya["cells"]["GDP"] is False
    assert list(kenya["cells"]) == [
        "debt stock",
        "debt service",
        "GDP",
        "revenue",
        "projection",
        "capacity",
    ]
    bhutan = next(r for r in rows if r["iso3"] == "BTN")
    assert bhutan["missing"] == []
    assert bhutan["cells"]["capacity"] is False


def test_listed() -> None:
    assert listed("None here", []) == "- None here: 0"
    assert listed("Some", ["AAA", "BBB"]) == "- Some: 2 (AAA, BBB)"


def test_render_coverage_structure() -> None:
    coverage = {v.base: coverage_rows(built_for(v.base, gap="KEN"), v) for v in VIEWS}
    missing = {b: [r["iso3"] for r in rows if r["missing"]] for b, rows in coverage.items()}
    guard = {"checked": 10, "failed": 22, "failures": [f"f{i}" for i in range(22)]}
    checks = {
        VIEWS[0].base: {"guard": guard, "cross": None, "terms_fallback": []},
        VIEWS[1].base: {
            "guard": {"checked": 4, "failed": 0, "failures": []},
            "cross": {"compared": 5, "differ": 1, "examples": ["KEN x 2024"]},
            "terms_fallback": ["AAA", "BBB"],
        },
    }
    text = render_coverage(
        coverage,
        missing,
        checks=checks,
        default_year=2025,
        notes=["a note"],
        views=VIEWS,
        today=TODAY,
    )
    lines = text.split("\n")
    assert lines[0] == "# Coverage of the debt-thresholds data"
    assert lines[2].startswith("Written by `fetch.py` on 2026-11-16.")
    assert "## Base year 2024" in lines
    assert "## Base year 2025" in lines
    assert "- Countries lacking a core series: 1 (KEN)" in lines
    assert "- Countries without a capacity: 1 (BTN)" in lines
    assert "- Countries without a projection: 0" in lines
    assert "- Creditor-group guard, 1%: -12 of 10 country-years pass" in lines
    assert "  - f19" in lines
    assert "  - f20" not in lines
    assert "  - and 2 more" in lines
    assert "- DFO against the IDS bulk files, 1%: 4 of 5 values agree" in lines
    assert "  - KEN x 2024" in lines
    assert (
        "- No 2015-19 commitments from a source, so the 58-country average terms stand in: AAA, BBB"
    ) in lines
    assert "| Kenya | KEN | **no** |" not in text  # GDP is the third mark, not the first
    assert "| Kenya | KEN | yes | yes | **no** | yes | yes | yes |" in lines
    assert "| Bhutan | BTN | yes | yes | yes | yes | yes | **no** |" in lines
    assert lines[-4:] == ["## Notes", "", "- a note", ""]
    assert text.endswith("\n")
