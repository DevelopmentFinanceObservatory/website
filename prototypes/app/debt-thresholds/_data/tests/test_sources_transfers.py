"""Offline test of the net-transfers read, with the SDK stubbed."""

from types import SimpleNamespace

import pytest

from pipeline.errors import DataError
from pipeline.sources.dfo_api import SEARCH_PLACE
from pipeline.sources.transfers import KEY, read_net_transfers
from pipeline.transfers import INDICATOR, WINDOW


class Reads:
    """Runs the build as a search-mode read does."""

    def __init__(self, client: object) -> None:
        self.client = client
        self.keys: list[str] = []

    def fetch(self, key: str, build) -> object:
        self.keys.append(key)
        self.reading, data = build()
        return data


def client(*, complete: bool, calls: dict, identity: dict | None = None) -> SimpleNamespace:
    rows = [{"value": 1.0}]
    spec = SimpleNamespace(definition={"identity": identity or {"entities": {"destination": []}}})
    dataset = SimpleNamespace(
        ref=SimpleNamespace(members=[SimpleNamespace(spec=spec)]),
        to_arrow=lambda: SimpleNamespace(to_pylist=lambda: rows),
    )

    def fetch(**kwargs: object) -> SimpleNamespace:
        calls["fetch"] = kwargs
        return dataset

    part = {
        "restatement": {"source_code": INDICATOR},
        "spec": {
            "spec_id": "spec_1",
            "definition": {"d": 1},
            "resolved": {"stat_vars": {"source_codes": [{"code": INDICATOR, "exact": True}]}},
        },
    }
    answer = SimpleNamespace(
        complete=complete,
        gaps=[SimpleNamespace(message="holds two series.")],
        raw={"parts": [part]},
        sentence="s",
        fetch=fetch,
    )

    def search(**kwargs: object) -> SimpleNamespace:
        calls["search"] = kwargs
        return answer

    return SimpleNamespace(search=search)


def test_read_net_transfers_searches_the_code_and_fetches_the_destinations() -> None:
    calls: dict[str, object] = {}
    reads = Reads(client(complete=True, calls=calls))

    assert read_net_transfers(["KEN", "UGA"], reads=reads) == [{"value": 1.0}]
    assert reads.keys == [KEY]
    assert reads.reading == {
        "code": INDICATOR,
        "openRoles": [],
        "sentence": "s",
        "sourceCodes": [{"code": INDICATOR, "exact": True}],
        "specId": "spec_1",
        "definition": {"d": 1},
    }
    assert calls["search"] == {
        "codes": [INDICATOR],
        "entities": {"destination": [SEARCH_PLACE]},
        "window": WINDOW,
    }
    assert calls["fetch"] == {
        "window": WINDOW,
        "entities": {"destination": ["country/KEN", "country/UGA"]},
        "progress": False,
    }


def test_read_net_transfers_refuses_a_code_that_reads_as_more_than_its_series() -> None:
    reads = Reads(client(complete=False, calls={}))
    with pytest.raises(DataError, match=f"{INDICATOR} did not read as its own series"):
        read_net_transfers(["KEN"], reads=reads)


def test_read_net_transfers_refuses_a_reading_by_creditor() -> None:
    identity = {"entities": {"destination": []}, "open_roles": ["origin"]}
    reads = Reads(client(complete=True, calls={}, identity=identity))
    with pytest.raises(DataError, match="spec of transfers binds"):
        read_net_transfers(["KEN"], reads=reads)
