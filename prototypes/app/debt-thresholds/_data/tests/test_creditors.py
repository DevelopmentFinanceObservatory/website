"""Tests for the creditor-group splits, the IMF charge estimate and the guard."""

import copy
from datetime import date

import pytest

from pipeline.config import views
from pipeline.countries import ISO3
from pipeline.creditors import estimate_imf_charges, groups, guard_groups, net_flows

VIEW = views(date(2026, 1, 1), current_ids="November 2026")[0]  # base 2024, end 2030


def test_groups_split_and_clean_rounding_noise() -> None:
    keys = {
        "ppg_service": {2020: 100.0},
        "mlat_service": {2020: 30.0},
        "blat_service": {2020: 40.0},
        "china_service": {2020: 10.0},
        "china_blat_service": {2020: 10.0},
        "imf_principal": {2020: 5.0},
        "imf_interest": {2020: 1.0},
    }
    assert groups(keys, "service", 2020) == {
        "multilateral": 30.0,
        "imf": 6.0,
        "bilateral": 30.0,
        "china": 10.0,
        "private": 30.0,
    }
    # A private residual a hair below zero is floored to zero.
    keys["ppg_service"][2020] = 70.0 - 0.1
    split = groups(keys, "service", 2020)
    assert split is not None
    assert split["private"] == 0.0


def test_groups_without_ppg_is_none() -> None:
    assert groups({}, "service", 2020) is None


def test_net_flows_is_disbursed_minus_repaid() -> None:
    keys = {
        "ppg_disb": {2020: 50.0},
        "mlat_disb": {2020: 50.0},
        "ppg_principal": {2020: 20.0},
        "mlat_principal": {2020: 5.0},
    }
    flows = net_flows(keys, 2020)
    assert flows is not None
    assert flows["multilateral"] == 45.0
    assert flows["private"] == -15.0
    assert net_flows(keys, 2021) is None


def test_estimate_imf_charges_projects_and_leaves_input_unchanged() -> None:
    panel = {
        "AAA": {
            "imf_stock": {2024: 100.0},
            "imf_interest": {2024: 5.0},
            "imf_principal": {2025: 40.0},
        },
        "BBB": {},
    }
    before = copy.deepcopy(panel)
    result = estimate_imf_charges(panel, VIEW)
    assert panel == before
    interest = result["AAA"]["imf_interest"]
    assert interest[2024] == 5.0
    assert interest[2025] == pytest.approx(5.0)  # 5% on 100
    assert interest[2026] == pytest.approx(3.0)  # 5% on 60
    assert set(interest) == {2024, *range(2025, 2031)}
    assert result["BBB"]["imf_interest"] == dict.fromkeys(range(2025, 2031), 0.0)


def _clean_panel() -> dict:
    return {iso3: {} for iso3 in ISO3}


def test_guard_groups_passes_consistent_and_flags_mismatch() -> None:
    panel = _clean_panel()
    first = ISO3[0]
    panel[first] = {
        "ppg_service": {2020: 100.0},
        "mlat_service": {2020: 60.0},
        "blat_service": {2020: 30.0},
        "prvt_service": {2020: 10.0},
    }
    assert guard_groups(panel, VIEW, {}) == {"checked": 1, "failed": 0, "failures": []}

    panel[first]["prvt_service"][2020] = 50.0
    report = guard_groups(panel, VIEW, {first: {2020: 90.0}})
    assert report["checked"] == 1
    assert report["failed"] == 1
    assert report["failures"][0].startswith(f"{first} 2020: MLAT+BLAT+PRVT 140 against PPG 100")
    assert "sum of DFO creditors 90 against PPG 100" in report["failures"][0]
