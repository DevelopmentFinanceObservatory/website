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


CURRENT = views(date(2026, 11, 16), current_ids="November 2026")[1]  # base 2025, end 2031


def weo_file(path: Path, data: dict, *, vintage: str = "October 2026", base: int = 2025) -> Path:
    """Write `data` as a WEO file read from the `vintage` release for base year `base`."""
    preload = {"vintage": vintage, "baseYear": base, "series": list(WEO_SERIES.values())}
    path.write_text(json.dumps({"provenance": {"preloads": [preload]}, "data": data}))
    return path


def full_years() -> dict:
    """Each series with a value in every year the 2025 view needs."""
    return {key: {str(year): 1.0 for year in range(2025, 2032)} for key in WEO_SERIES}


def test_read_weo_file_reads_years_as_ints_and_a_missing_series_as_empty(tmp_path: Path):
    data = {iso3: {} for iso3 in ISO3}
    data["KEN"] = {"revenue_pct": {"2025": 17.5, "2024": 18}}
    data["UGA"] = full_years()
    panel = read_weo_file(weo_file(tmp_path / "weo-2025.json", data), CURRENT)
    assert panel["KEN"]["revenue_pct"] == {2025: 17.5, 2024: 18.0}
    assert panel["KEN"]["gdp_usd_bn"] == {}
    assert list(panel["UGA"]) == list(WEO_SERIES)


@pytest.mark.parametrize(
    ("change", "match"),
    [
        ({"countries": ["KEN"]}, "lacks"),
        ({"vintage": "April 2026"}, "reads the October 2026 release"),
        ({"base": 2024}, "reads the October 2026 release"),
        ({"end": 2030}, "no gdp_usd_bn value in 2031"),
    ],
)
def test_read_weo_file_refuses_a_file_that_is_not_the_views_slice(
    tmp_path: Path, change: dict, match: str
):
    end = change.get("end", 2031)
    years = {key: {str(year): 1.0 for year in range(2025, end + 1)} for key in WEO_SERIES}
    data = {iso3: years for iso3 in change.get("countries", ISO3)}
    path = weo_file(
        tmp_path / "weo-2025.json",
        data,
        vintage=change.get("vintage", "October 2026"),
        base=change.get("base", 2025),
    )
    with pytest.raises(DataError, match=match):
        read_weo_file(path, CURRENT)


def test_read_weo_file_refuses_a_missing_file(tmp_path: Path):
    with pytest.raises(DataError, match=r"weo-2025\.json is missing"):
        read_weo_file(tmp_path / "weo-2025.json", CURRENT)


def test_the_committed_weo_file_covers_every_country():
    panel = read_weo_file(Path(__file__).resolve().parent.parent / "weo-2025.json", CURRENT)
    assert set(panel) == set(ISO3)
    assert sum(bool(keys["revenue_pct"]) for keys in panel.values()) > len(ISO3) / 2
