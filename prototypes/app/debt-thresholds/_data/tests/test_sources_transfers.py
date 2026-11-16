"""Offline test of the net-transfers read, with the SDK stubbed."""

import sys
from types import SimpleNamespace

from pipeline.sources.transfers import NetTransfers, read_net_transfers
from pipeline.transfers import QUERY


def test_read_net_transfers_searches_once_and_fetches_the_destinations(monkeypatch) -> None:
    calls: dict[str, object] = {}
    rows = [{"stat_var": "x"}]
    dataset = SimpleNamespace(
        sentence="s",
        citation=SimpleNamespace(text="c"),
        members=[SimpleNamespace(content_version="cv_1")],
        to_arrow=lambda: SimpleNamespace(to_pylist=lambda: rows),
    )

    def search(query: str) -> SimpleNamespace:
        calls["query"] = query
        return SimpleNamespace(specs=["spec"])

    def fetch(spec: str, **kwargs: object) -> SimpleNamespace:
        calls["fetch"] = (spec, kwargs)
        return dataset

    monkeypatch.setitem(sys.modules, "dfo", SimpleNamespace(search=search, fetch=fetch))

    result = read_net_transfers(["KEN", "UGA"])

    assert result == NetTransfers(rows=rows, sentence="s", citation="c", version="cv_1")
    assert calls["query"] == QUERY
    assert calls["fetch"] == (
        "spec",
        {"window": "all", "entities": {"destination": ["country/KEN", "country/UGA"]}},
    )
