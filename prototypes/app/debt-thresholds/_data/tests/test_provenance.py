from datetime import UTC, datetime, timedelta, timezone

from pipeline.provenance import Ledger, envelope_provenance


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


def test_envelope_provenance_keys_and_utc_stamp():
    ledger = Ledger()
    ledger.read({"key": "y"})
    moment = datetime(2026, 11, 16, 19, 5, 6, 789123, tzinfo=timezone(timedelta(hours=1)))
    provenance = envelope_provenance(ledger, sdk_version="0.2.0", retrieved=moment, citation="c")
    assert list(provenance) == ["sdk", "query", "retrieved", "citation", "dfo", "preloads"]
    assert provenance["sdk"] == "development-finance==0.2.0"
    assert provenance["retrieved"] == "2026-11-16T18:05:06.789Z"
    assert provenance["dfo"] == [{"key": "y"}]
    assert provenance["preloads"] == []
    assert (
        envelope_provenance(
            ledger, sdk_version="0.2.0", retrieved=moment.astimezone(UTC), citation="c"
        )
        == provenance
    )
