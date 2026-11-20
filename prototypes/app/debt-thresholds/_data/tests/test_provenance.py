from datetime import datetime, timedelta, timezone

from pipeline.provenance import Ledger, envelope_provenance, utc_stamp


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


def test_envelope_provenance_keys():
    ledger = Ledger()
    ledger.read({"key": "y"})
    provenance = envelope_provenance(
        ledger, sdk_version="0.4.1", retrieved="2026-11-16T18:05:06.789Z", citation="c"
    )
    assert list(provenance) == ["sdk", "query", "retrieved", "citation", "dfo", "preloads"]
    assert provenance["sdk"] == "development-finance==0.4.1"
    assert provenance["retrieved"] == "2026-11-16T18:05:06.789Z"
    assert provenance["dfo"] == [{"key": "y"}]
    assert provenance["preloads"] == []
