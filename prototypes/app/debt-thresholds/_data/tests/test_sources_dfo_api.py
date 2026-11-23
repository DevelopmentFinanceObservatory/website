"""Offline tests for the DFO helpers, the series codes and the pinned specs file."""

import copy
import json
from collections import defaultdict
from pathlib import Path
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
    check_roles,
    pinned_specs,
    put,
)
from pipeline.sources.pinned import Mode, Reads


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


def reads(client) -> Reads:
    """Reads that run each cut on the ref's own version, as a plain run does."""
    return Reads(client, mode=Mode.PLAIN, committed={})


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
    frame = by_creditor(reads(client), "service_by_creditor", "ref", sums)
    assert list(frame[["iso3", "year", "value"]].itertuples(index=False, name=None)) == [
        ("KEN", 2020, 2.0)
    ]
    assert sums == {"KEN": {2020: 9.0}}
    by_creditor(reads(client), "principal_by_creditor", "ref", sums := defaultdict(dict))
    assert sums == {}


def test_by_creditor_refuses_imf_among_creditors():
    client = SimpleNamespace(analysis=Analysis({IMF: [row("KEN", "2020", 1.0)]}))
    with pytest.raises(DataError, match="IMF is among the creditors"):
        by_creditor(reads(client), "service_by_creditor", "ref", defaultdict(dict))


REFS = json.loads((Path(__file__).parent.parent / "refs.json").read_text())["data"]


def spec(key: str, change=None) -> SimpleNamespace:
    """The committed spec of `key`, with `change` applied to a copy of its identity."""
    definition = copy.deepcopy(REFS[key]["ref"]["members"][0]["spec"]["definition"])
    if change:
        change(definition["identity"])
    return SimpleNamespace(definition=definition)


@pytest.mark.parametrize("key", list(REFS))
def test_check_roles_accepts_every_committed_reading(key: str) -> None:
    check_roles(key, spec(key))


def open_origin(identity: dict) -> None:
    identity["open_roles"] = ["origin"]


def bind_imf(identity: dict) -> None:
    identity["entities"]["origin"] = [IMF]


def close_origin(identity: dict) -> None:
    del identity["open_roles"]


def bind_place(identity: dict) -> None:
    identity["entities"]["destination"] = identity["entities"].pop("observationAbout")


@pytest.mark.parametrize(
    ("key", "change"),
    [
        ("service", open_origin),  # an all-creditor code read creditor by creditor
        ("imf_stock", bind_imf),  # the IMF is in the code; a bound origin is a new spec
        ("service_by_creditor", close_origin),  # a by-creditor code read as the total
        ("service_by_creditor", bind_imf),
        ("gdp", bind_place),
    ],
)
def test_check_roles_refuses_a_drifted_role(key: str, change) -> None:
    with pytest.raises(DataError, match=f"spec of {key} binds"):
        check_roles(key, spec(key, change))
