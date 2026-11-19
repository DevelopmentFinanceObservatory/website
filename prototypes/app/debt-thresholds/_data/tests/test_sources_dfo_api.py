"""Offline tests for the DFO helpers, the series codes and the pinned specs file."""

from collections import defaultdict
from types import SimpleNamespace

import pytest

from pipeline.errors import DataError
from pipeline.sources.dfo_api import (
    CHINA,
    CHINA_KEYS,
    CODES,
    DFO_KEYS,
    IMF,
    Collected,
    by_creditor,
    pinned_specs,
    put,
)


def test_put_stores_one_value_per_country_year():
    collected: Collected = {"KEN": defaultdict(dict)}
    put(collected, [("KEN", 2020, 1.5), ("KEN", 2021, 2)], "ppg_stock")
    assert collected["KEN"]["ppg_stock"] == {2020: 1.5, 2021: 2.0}


def test_put_refuses_several_rows_per_country_year():
    collected: Collected = {"KEN": defaultdict(dict)}
    with pytest.raises(DataError, match="several rows per country-year for ppg_stock"):
        put(collected, [("KEN", 2020, 1.0), ("KEN", 2020, 2.0)], "ppg_stock")


def test_codes_and_pinned_specs_cover_every_reading_the_fetch_maps_once():
    specs = pinned_specs()
    assert not set(CODES) & set(specs)
    assert set(CODES) | set(specs) == set(DFO_KEYS) | set(CHINA_KEYS)
    assert all(pin["definition"]["spec_id"].startswith("spec_") for pin in specs.values())


class Analysis:
    """DFO's filter and aggregate over fixed rows, by the origin each keeps."""

    def __init__(self, rows: dict[str, list[dict]]) -> None:
        self.rows = rows

    def _frame(self, rows: list[dict]):
        import pandas as pd

        columns = ["financingRecipient", "time_period", "value"]
        return SimpleNamespace(to_pandas=lambda: pd.DataFrame(rows, columns=columns))

    def filter(self, ref, *, keep):
        rows = self.rows.get(keep["origin"], [])
        return Sized(self._frame(rows), len(rows))

    def aggregate(self, ref, *, by):
        assert by == "destination"
        return self._frame(self.rows["sum"])


class Sized(SimpleNamespace):
    def __init__(self, inner, size: int) -> None:
        super().__init__(to_pandas=inner.to_pandas)
        self.size = size

    def __len__(self) -> int:
        return self.size


def row(iso3: str, year: str, value: float | None) -> dict:
    return {"financingRecipient": f"country/{iso3}", "time_period": year, "value": value}


def test_by_creditor_cuts_china_and_sums_creditors_for_service():
    client = SimpleNamespace(
        analysis=Analysis(
            {
                CHINA: [row("KEN", "2020", 2.0), row("KEN", "2021", None), row("XXX", "2020", 1.0)],
                "sum": [row("KEN", "2020", 9.0)],
            }
        )
    )
    sums: dict = defaultdict(dict)
    frame = by_creditor(client, "service_by_creditor", "ref", sums)
    assert list(frame[["iso3", "year", "value"]].itertuples(index=False, name=None)) == [
        ("KEN", 2020, 2.0)
    ]
    assert sums == {"KEN": {2020: 9.0}}
    by_creditor(client, "principal_by_creditor", "ref", sums := defaultdict(dict))
    assert sums == {}


def test_by_creditor_refuses_imf_among_creditors():
    client = SimpleNamespace(analysis=Analysis({IMF: [row("KEN", "2020", 1.0)]}))
    with pytest.raises(DataError, match="IMF is among the creditors"):
        by_creditor(client, "service_by_creditor", "ref", defaultdict(dict))
