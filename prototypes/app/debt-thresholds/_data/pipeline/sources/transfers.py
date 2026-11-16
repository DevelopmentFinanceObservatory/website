"""Net transfers on external debt, read through the Development Finance Observatory."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pipeline.transfers import QUERY


@dataclass(frozen=True)
class NetTransfers:
    """The rows of one fetch and the text that describes it."""

    rows: list[dict[str, Any]]
    sentence: str
    citation: str
    version: str


def read_net_transfers(iso3s: Sequence[str]) -> NetTransfers:
    """Return the IDS net-transfers rows for the countries, read with one search and one fetch.

    `pipeline.transfers.build_transfers` checks the rows and turns them into the
    file's data.
    """
    # Imported here so the module loads without the SDK installed.
    import dfo

    answer = dfo.search(QUERY)
    spec = answer.specs[0]
    destinations = [f"country/{iso3}" for iso3 in iso3s]
    dataset = dfo.fetch(spec, window="all", entities={"destination": destinations})
    return NetTransfers(
        rows=dataset.to_arrow().to_pylist(),
        sentence=dataset.sentence,
        citation=dataset.citation.text,
        version=str(dataset.members[0].content_version),
    )
