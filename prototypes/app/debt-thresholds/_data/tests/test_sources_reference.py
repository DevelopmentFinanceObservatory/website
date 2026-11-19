"""Offline tests for the reference-data parsers."""

from datetime import date

import pytest

from pipeline import sources
from pipeline.config import views
from pipeline.countries import COUNTRIES, ISO3
from pipeline.errors import DataError
from pipeline.sources.pinned import Mode
from pipeline.sources.reference import (
    capacity_notes,
    parse_ida,
    parse_us_rate,
    snapshot_values,
    view_snapshots,
)

TODAY = date(2026, 11, 19)
BOTH = views(TODAY, current_ids="November 2026")


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


def test_snapshot_values_reads_years_as_numbers_and_drops_missing_rates():
    rate, ida = snapshot_values(
        {"read": "x", "usRate": {"2019": 2.1, "2025": None}, "ida": {"A": True}}
    )
    assert rate == {2019: 2.1}
    assert ida == {"A": True}


def live(monkeypatch) -> list[int]:
    """Stub the live read; return the base years it was called for."""
    called: list[int] = []

    def read_reference(view, *, client, today):
        called.append(view.base)
        return {"read": today.isoformat(), "base": view.base}

    monkeypatch.setattr(sources.reference, "read_reference", read_reference)
    return called


@pytest.mark.parametrize("mode", [Mode.REFRESH, Mode.SEARCH])
def test_a_refresh_keeps_the_archived_view_and_reads_the_current_one(monkeypatch, mode):
    called = live(monkeypatch)
    committed = {"2024": {"read": "2026-11-16"}, "2025": {"read": "2026-11-16"}}
    snapshots = view_snapshots(BOTH, committed, mode=mode, client=None, today=TODAY)
    assert called == [2025]
    assert snapshots == {"2024": committed["2024"], "2025": {"read": "2026-11-19", "base": 2025}}


def test_a_refresh_reads_a_view_the_file_lacks(monkeypatch):
    called = live(monkeypatch)
    view_snapshots(BOTH, {}, mode=Mode.REFRESH, client=None, today=TODAY)
    assert called == [2024, 2025]


def test_a_plain_run_takes_every_committed_view_and_refuses_a_missing_one(monkeypatch):
    called = live(monkeypatch)
    committed = {"2024": {"read": "a"}, "2025": {"read": "b"}}
    assert view_snapshots(BOTH, committed, mode=Mode.PLAIN, client=None, today=TODAY) == committed
    with pytest.raises(DataError, match="no 2025 view"):
        view_snapshots(BOTH, {"2024": {}}, mode=Mode.PLAIN, client=None, today=TODAY)
    assert called == []
