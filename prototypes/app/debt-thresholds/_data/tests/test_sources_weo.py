"""Offline tests for the WEO panel builder, name check and committed file."""

import json
from datetime import date
from pathlib import Path

import pytest

from pipeline.config import views
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.sources.weo import WEO_NAMES, WEO_SERIES, check_weo_names, read_weo_file, weo_panel


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


def test_read_weo_file_reads_years_as_ints_and_a_missing_series_as_empty(tmp_path: Path):
    data = {iso3: {} for iso3 in ISO3}
    data["KEN"] = {"revenue_pct": {"2025": 17.5, "2024": 18}}
    path = tmp_path / "weo-2025.json"
    path.write_text(json.dumps({"provenance": {}, "data": data}))
    panel = read_weo_file(path)
    assert panel["KEN"]["revenue_pct"] == {2025: 17.5, 2024: 18.0}
    assert panel["KEN"]["gdp_usd_bn"] == {}
    assert list(panel["UGA"]) == list(WEO_SERIES)


def test_read_weo_file_refuses_a_file_without_a_country(tmp_path: Path):
    path = tmp_path / "weo-2025.json"
    path.write_text(json.dumps({"provenance": {}, "data": {"KEN": {}}}))
    with pytest.raises(DataError, match="lacks"):
        read_weo_file(path)


def test_the_committed_weo_file_covers_every_country():
    panel = read_weo_file(Path(__file__).resolve().parent.parent / "weo-2025.json")
    assert set(panel) == set(ISO3)
    assert sum(bool(keys["revenue_pct"]) for keys in panel.values()) > len(ISO3) / 2
