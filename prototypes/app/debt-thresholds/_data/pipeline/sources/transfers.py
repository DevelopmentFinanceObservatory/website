"""Net transfers on external debt, read through the Development Finance Observatory."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from pipeline.errors import DataError
from pipeline.sources.dfo_api import SEARCH_PLACE, check_roles, reading_record
from pipeline.sources.pinned import Reads
from pipeline.transfers import INDICATOR, WINDOW

if TYPE_CHECKING:
    import dfo

KEY = "transfers"


def read_net_transfers(iso3s: Sequence[str], *, reads: Reads) -> list[dict[str, Any]]:
    """Return the IDS net-transfers rows for the countries, one pinned ref.

    `pipeline.transfers.transfers_by_country` turns the rows into the page's series.
    """
    destinations = [f"country/{iso3}" for iso3 in iso3s]

    def build() -> tuple[dict, dfo.Dataset]:
        answer = reads.client.search(
            codes=[INDICATOR], entities={"destination": [SEARCH_PLACE]}, window=WINDOW
        )
        if not answer.complete:
            raise DataError(
                f"{INDICATOR} did not read as its own series: "
                + " ".join(gap.message for gap in answer.gaps)
            )
        data = answer.fetch(window=WINDOW, entities={"destination": destinations}, progress=False)
        return reading_record(answer), data

    data = reads.fetch(KEY, build)
    check_roles(KEY, data.ref.members[0].spec)
    return data.to_arrow().to_pylist()
