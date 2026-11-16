"""Tests for the present-value estimate of the debt stock."""

import pytest

from pipeline.valuation import present_value


def _keys(*, face=1000.0, concessional=600.0, elements=None, official=None, private=None) -> dict:
    return {
        "ppg_stock": {2024: face},
        "ppg_concessional_stock": {2024: concessional},
        "ppg_grant_element": elements if elements is not None else {2015: 30.0, 2024: 50.0},
        "com_offt": official if official is not None else {2015: 100.0},
        "com_prvt": private if private is not None else {2024: 300.0},
    }


def test_present_value_discounts_the_concessional_share_by_the_weighted_grant_element() -> None:
    # Grant element (30 * 100 + 50 * 300) / 400 = 45%, so 1000 * (1 - 0.6 * 0.45).
    assert present_value(_keys(), 2024) == pytest.approx(730.0)


@pytest.mark.parametrize(
    ("keys", "expected"),
    [
        # A year without commitments weighs nothing, though IDS reports its element as 0.
        (_keys(elements={2015: 0.0, 2024: 50.0}, official={}), 700.0),
        # Grant elements outside 2015 to the base year are ignored.
        (_keys(elements={2014: 90.0, 2024: 50.0}, official={2014: 900.0}), 700.0),
        # A concessional stock above the PPG stock counts as all of it.
        (_keys(concessional=1200.0), 550.0),
        # No concessional debt leaves face value.
        (_keys(concessional=0.0), 1000.0),
    ],
)
def test_present_value_edges(keys: dict, expected: float) -> None:
    assert present_value(keys, 2024) == pytest.approx(expected)


@pytest.mark.parametrize(
    "missing", ["ppg_stock", "ppg_concessional_stock", "ppg_grant_element", "commitments"]
)
def test_present_value_is_missing_without_its_inputs(missing: str) -> None:
    keys = _keys()
    for key in ("com_offt", "com_prvt") if missing == "commitments" else (missing,):
        keys[key] = {}
    assert present_value(keys, 2024) is None
