"""Offline tests for the reference-data parsers."""

import pytest

from pipeline.countries import COUNTRIES, ISO3
from pipeline.errors import DataError
from pipeline.sources.reference import capacity_notes, parse_ida, parse_us_rate


def test_parse_us_rate_averages_complete_years_only():
    months = [f"2020-{m:02d}-01,{m}.0" for m in range(1, 13)]
    text = "\n".join(["observation_date,GS10", *months, "2021-01-01,3.0", "2021-02-01,."])
    assert parse_us_rate(text) == {2020: 6.5}


def payload(missing: str | None = None) -> list:
    kinds = {iso3: {"id": "IDX" if i % 2 else "IBD"} for i, iso3 in enumerate(ISO3)}
    kinds.pop(missing, None)
    return [{}, [{"id": iso3, "lendingType": kind} for iso3, kind in kinds.items()]]


def test_parse_ida_flags_ida_and_blend():
    ida = parse_ida(payload())
    assert ida[ISO3[0]] is False
    assert ida[ISO3[1]] is True


def test_parse_ida_names_countries_without_a_category():
    with pytest.raises(DataError, match="no World Bank lending category for BTN"):
        parse_ida(payload(missing="BTN"))


def test_capacity_notes_report_gaps_and_mismatches():
    first = COUNTRIES[0]
    rows = {first.iso3: {"iso3": first.iso3, "fdl2024": "lower risk", "dsa_date": "2024-05"}}
    notes = capacity_notes(rows)
    assert f"capacity.csv has no row for {COUNTRIES[1].iso3}." in notes
    assert any("gives BTN the FDL group lower risk" in n for n in notes)
    assert any("no capacity_2024 column" in n for n in notes)
    assert any("year and month" in n for n in notes)
