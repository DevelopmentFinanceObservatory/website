"""Offline tests for the WEO panel builder and name check."""

from datetime import date

import pytest

from pipeline.config import views
from pipeline.errors import DataError
from pipeline.sources.weo import WEO_NAMES, WEO_SERIES, check_weo_names, weo_panel


def test_weo_panel_maps_codes_to_keys_and_drops_the_rest():
    rows = [
        ("KEN", WEO_SERIES["revenue_pct"], 2024, 17.5),
        ("KEN", WEO_SERIES["gdp_usd_bn"], 2023, 100),
        ("KEN", "OTHER", 2023, 1.0),
    ]
    panel = weo_panel(rows)
    assert panel["KEN"] == {"gdp_usd_bn": {2023: 100.0}, "revenue_pct": {2024: 17.5}}
    assert list(panel["KEN"]) == ["gdp_usd_bn", "revenue_pct"]
    assert panel["UGA"] == {}


def test_check_weo_names_refuses_a_renamed_series():
    view = views(date(2026, 11, 16), current_ids="November 2026")[0]
    names = {code: {label} for code, label in WEO_NAMES.items()}
    check_weo_names(names, view)
    names["NGDPD"] = {"Something else"}
    with pytest.raises(DataError, match="NGDPD is named"):
        check_weo_names(names, view)
