"""Tests for the present-value estimate of the debt stock."""

import pytest

from pipeline.valuation import present_value


def _keys(*, face=1000.0, concessional=600.0, elements=None) -> dict:
    return {
        "ppg_stock": {2024: face},
        "ppg_concessional_stock": {2024: concessional},
        "ppg_grant_element": elements if elements is not None else {2015: 30.0, 2024: 50.0},
    }


def test_present_value_discounts_the_concessional_share_by_the_mean_grant_element() -> None:
    # 60% concessional, mean grant element 40%: 1000 * (1 - 0.6 * 0.4)
    assert present_value(_keys(), 2024) == pytest.approx(760.0)


@pytest.mark.parametrize(
    ("keys", "expected"),
    [
        # Grant elements outside 2015 to the base year are ignored.
        (_keys(elements={2014: 90.0, 2024: 50.0, 2025: 90.0}), 700.0),
        # A concessional stock above the PPG stock counts as all of it.
        (_keys(concessional=1200.0), 600.0),
        # No concessional debt leaves face value.
        (_keys(concessional=0.0), 1000.0),
    ],
)
def test_present_value_edges(keys: dict, expected: float) -> None:
    assert present_value(keys, 2024) == pytest.approx(expected)


@pytest.mark.parametrize("missing", ["ppg_stock", "ppg_concessional_stock", "ppg_grant_element"])
def test_present_value_is_missing_without_its_inputs(missing: str) -> None:
    keys = _keys()
    keys[missing] = {}
    assert present_value(keys, 2024) is None
