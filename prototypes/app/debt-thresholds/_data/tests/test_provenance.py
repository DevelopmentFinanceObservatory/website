from datetime import datetime, timedelta, timezone

from pipeline.provenance import Ledger, outside_provenance, utc_stamp


def test_ledger_records_in_order_and_views_are_read_only():
    ledger = Ledger()
    ledger.note("a")
    ledger.note("b")
    ledger.preload({"name": "x"})
    ledger.read({"key": "y"})
    assert ledger.notes == ("a", "b")
    assert ledger.preloads == ({"name": "x"},)
    assert ledger.reads == ({"key": "y"},)
    assert not hasattr(ledger.notes, "append")


def test_utc_stamp_writes_utc_to_the_millisecond():
    moment = datetime(2026, 11, 16, 19, 5, 6, 789123, tzinfo=timezone(timedelta(hours=1)))
    assert utc_stamp(moment) == "2026-11-16T18:05:06.789Z"


def test_outside_provenance_names_each_source_once() -> None:
    preloads = [
        {"name": "FRED", "baseYear": 2024},
        {"name": "WEO"},
        {"name": "FRED", "baseYear": 2025},
    ]
    provenance = outside_provenance(
        preloads, sdk_version="0.4.2", query="q", retrieved="2026-11-16T18:05:06.789Z"
    )
    assert list(provenance) == ["sdk", "query", "retrieved", "outside", "preloads"]
    assert provenance["sdk"] == "development-finance==0.4.2"
    assert provenance["outside"] == ["FRED", "WEO"]
    assert provenance["preloads"] == preloads
