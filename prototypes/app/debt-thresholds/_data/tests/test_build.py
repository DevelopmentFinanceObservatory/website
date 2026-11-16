"""Tests for the per-country records of a view."""

from datetime import date

from pipeline.build import build_view
from pipeline.config import HISTORY, views
from pipeline.countries import ISO3

VIEW = views(date(2026, 1, 1), current_ids="November 2026")[0]  # base 2024, end 2030, no DFO GDP


_TERM = {"rate": 3.0, "maturity": 10.0, "grace": 2.0}
TERMS = {"official": _TERM, "private": _TERM}


def _fiscal() -> dict[str, dict[int, float]]:
    years = range(VIEW.base - HISTORY, VIEW.end + 1)
    return {
        "gdp_usd_bn": dict.fromkeys(years, 10.0),
        "revenue_pct": dict.fromkeys(years, 20.0),
        "primary_balance_pct": dict.fromkeys(years, -1.0),
        "gg_debt_pct": {VIEW.base: 50.0},
    }


def test_build_view_shapes_records_and_inputs_for_every_country() -> None:
    every_year = range(2015, VIEW.end + 1)
    flows = {
        "ppg_service": dict.fromkeys(every_year, 10.0),
        "ppg_disb": dict.fromkeys(every_year, 12.0),
        "ppg_principal": dict.fromkeys(every_year, 6.0),
        "mlat_service": dict.fromkeys(every_year, 10.0),
    }
    panel = {iso3: {key: dict(series) for key, series in flows.items()} for iso3 in ISO3}
    panel[ISO3[0]] |= {
        "ppg_stock": {2024: 100.0},
        "imf_stock": {2024: 20.0},
        "ppg_concessional_stock": {2024: 50.0},
        "ppg_grant_element": {2024: 40.0},
    }
    built, inputs = build_view(
        VIEW,
        panel,
        weo={iso3: _fiscal() for iso3 in ISO3},
        us_rate=dict.fromkeys(range(2015, 2025), 4.0),
        ida=dict.fromkeys(ISO3, False),
        terms=dict.fromkeys(ISO3, TERMS),
        capacity={ISO3[0]: {"capacity": "3.0", "dsa_url": "u", "dsa_date": "2025-01"}},
    )
    assert set(built) == set(inputs) == set(ISO3)
    first = built[ISO3[0]]
    assert first["debtFace"] == 100  # PPG only: the debt test leaves out IMF credit
    assert first["debtPV"] == 80  # half concessional at a 40% grant element
    assert inputs[ISO3[0]]["external_debt"] == {"2024": 120.0}  # the projection keeps it
    assert first["gdp"] == 10_000_000_000
    assert first["capacitySource"] == "dsa"
    assert [row["year"] for row in first["years"]] == list(range(2016, 2031))
    assert first["years"][0]["revenue"] == 2_000_000_000
    assert first["years"][0]["service"]["multilateral"] == 10
    assert first["years"][-1]["projected"] is True
    assert inputs[ISO3[0]]["external_debt"] == {"2024": 120.0}
    assert inputs[ISO3[0]]["projection_error"] is None
    assert built[ISO3[1]]["debtFace"] is None  # no stock reported
    assert built[ISO3[1]]["debtPV"] is None
    assert built[ISO3[1]]["capacity"] is None
