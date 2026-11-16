"""Offline tests for the DFO helpers and the pinned specs file."""

from collections import defaultdict

import pytest

from pipeline.errors import DataError
from pipeline.sources.dfo_api import DFO_KEYS, PINNED_ORIGIN, Collected, pinned_specs, put


def test_put_stores_one_value_per_country_year():
    collected: Collected = {"KEN": defaultdict(dict)}
    put(collected, [("KEN", 2020, 1.5), ("KEN", 2021, 2)], "ppg_stock")
    assert collected["KEN"]["ppg_stock"] == {2020: 1.5, 2021: 2.0}


def test_put_refuses_several_rows_per_country_year():
    collected: Collected = {"KEN": defaultdict(dict)}
    with pytest.raises(DataError, match="several rows per country-year for ppg_stock"):
        put(collected, [("KEN", 2020, 1.0), ("KEN", 2020, 2.0)], "ppg_stock")


def test_pinned_specs_cover_every_reading_the_fetch_maps():
    specs = pinned_specs()
    plain = {key for key in specs if not key.endswith("_by_creditor") and key != "imf_flows"}
    assert plain == set(DFO_KEYS)
    assert set(PINNED_ORIGIN) <= set(specs)
    assert all(pin["definition"]["spec_id"].startswith("spec_") for pin in specs.values())
