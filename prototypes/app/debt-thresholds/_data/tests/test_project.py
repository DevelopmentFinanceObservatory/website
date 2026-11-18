"""Tests for project.py, FDL's debt-service projection with new borrowing."""

import pytest

from pipeline.project import (
    loan_service,
    new_borrowing,
    new_loan_rate,
    project_service,
    source_shares,
    us_rate_path,
)

ZERO = {"multilateral": 0, "imf": 0, "bilateral": 0, "china": 0, "private": 0}


def flows(**amounts: float) -> dict[int, dict[str, float]]:
    return {2019: {**ZERO, **amounts}}


@pytest.mark.parametrize(
    ("amounts", "expected"),
    [
        # In proportion; IMF counts with multilateral and China with bilateral.
        (
            {
                "multilateral": 30,
                "imf": 10,
                "bilateral": 10,
                "china": 10,
                "private": 20,
            },
            {"multilateral": 0.5, "bilateral": 0.25, "private": 0.25},
        ),
        # A negative sum gets no share.
        (
            {"multilateral": 60, "bilateral": -40, "private": 20},
            {"multilateral": 0.75, "bilateral": 0.0, "private": 0.25},
        ),
        # All zero: one third each.
        ({}, {"multilateral": 1 / 3, "bilateral": 1 / 3, "private": 1 / 3}),
        # None positive: one third each.
        (
            {"multilateral": -5, "private": -1},
            {"multilateral": 1 / 3, "bilateral": 1 / 3, "private": 1 / 3},
        ),
    ],
)
def test_allocation_shares(amounts, expected):
    assert source_shares(flows(**amounts), base_year=2024) == pytest.approx(expected)


def test_allocation_ignores_years_after_base():
    net = {2020: {**ZERO, "private": 10}, 2025: {**ZERO, "multilateral": 1000}}
    assert source_shares(net, base_year=2024)["private"] == 1.0


def test_by_source_rolls_over_own_service_and_splits_deficit():
    shares = {"multilateral": 0.5, "bilateral": 0.0, "private": 0.5}
    due = {"multilateral": 10, "bilateral": 6, "private": 0}
    by_source = new_borrowing(due, 8, shares=shares, refinance="by_source")
    pooled = new_borrowing(due, 8, shares=shares, refinance="pooled")
    assert by_source == pytest.approx({"multilateral": 14, "bilateral": 6, "private": 4})
    assert pooled == pytest.approx({"multilateral": 12, "bilateral": 0, "private": 12})


def test_rate_path_reverts_linearly_to_three_percent():
    path = us_rate_path(5.0, base_year=2024, end_year=2028)
    assert path == pytest.approx({2024: 5.0, 2025: 4.5, 2026: 4.0, 2027: 3.5, 2028: 3.0})


@pytest.mark.parametrize(
    ("protected", "reference", "expected"),
    [
        (False, 1.0, 3.0),  # 4.0 + (1.0 - 2.0)
        (False, 6.0, 8.0),  # 4.0 + (6.0 - 2.0)
        (True, 1.0, 1.0),  # IDA: the 2015-19 official rate itself
        (False, -3.0, 0.0),  # floored at zero
    ],
)
def test_new_loan_rate(protected, reference, expected):
    rate = new_loan_rate(4.0, reference_rate=reference, us_reference=2.0, protected=protected)
    assert rate == pytest.approx(expected)


def test_loan_service_grace_then_equal_instalments():
    # 100 at 10%, 3 years, 1 of grace: interest only, then two halves.
    service = loan_service(100, rate=10, maturity=3, grace=1, issued=2025)
    assert service == pytest.approx({2026: 10, 2027: 60, 2028: 55})


def base_inputs(**overrides):
    """Two projected years, worked by hand in test_two_year_example."""
    inputs = {
        "contracted": {
            "2025": {**ZERO, "multilateral": 10},
            "2026": {**ZERO, "multilateral": 10},
        },
        "net_flows": {"2019": {**ZERO, "multilateral": 50, "private": 50}},
        "external_debt": {"2024": 200},
        "gdp": {"2024": 1000, "2025": 1000, "2026": 1000},
        "primary_balance": {"2025": -2, "2026": -2},
        "gg_debt": {"2024": 50},
        "us_rate": {**{str(y): 2.0 for y in range(2015, 2020)}, "2024": 5.0},
        "terms": {
            "official": {"rate": 1.0, "maturity": 2, "grace": 0},
            "private": {"rate": 6.0, "maturity": 1, "grace": 0},
        },
        "ida": False,
    }
    return inputs | overrides


def test_two_year_example():
    # External share = 200 / (50% x 1000) = 0.4; external deficit = 0.4 x 2% x 1000 = 8,
    # split 4 multilateral, 4 private. US rate 5 -> 4 (2025) -> 3 (2026); spreads
    # official 1 - 2 = -1, private 6 - 2 = +4.
    # 2025: multilateral borrows 10 + 4 = 14 at 3% for 2 years; private 4 at 8% for 1.
    # 2026: multilateral new service 14 x 3% + 7 = 7.42; private 4 x 8% + 4 = 4.32.
    #       Borrowing: multilateral 10 + 7.42 + 4 = 21.42, private 4.32 + 4 = 8.32.
    y2025, y2026 = project_service(base_inputs(), base_year=2024, end_year=2026)

    assert y2025["year"] == 2025
    assert y2025["new"] == pytest.approx(ZERO)
    assert y2025["service"] == pytest.approx({**ZERO, "multilateral": 10})
    assert y2025["borrowing"] == pytest.approx({"multilateral": 14, "bilateral": 0, "private": 4})

    assert y2026["contracted"] == pytest.approx({**ZERO, "multilateral": 10})
    assert y2026["new"] == pytest.approx({**ZERO, "multilateral": 7.42, "private": 4.32})
    assert y2026["service"] == pytest.approx({**ZERO, "multilateral": 17.42, "private": 4.32})
    assert y2026["borrowing"] == pytest.approx(
        {"multilateral": 21.42, "bilateral": 0, "private": 8.32}
    )


def test_surplus_reduces_lending_and_never_below_zero():
    # Surplus 5% of GDP: external surplus 0.4 x 50 = 20, 10 per source.
    # Multilateral: 10 due - 10 = 0. Private: 0 due - 10, held at 0.
    inputs = base_inputs(primary_balance={"2025": 5, "2026": 5})
    y2025, y2026 = project_service(inputs, base_year=2024, end_year=2026)
    assert y2025["borrowing"] == pytest.approx({"multilateral": 0, "bilateral": 0, "private": 0})
    assert y2026["new"] == pytest.approx(ZERO)
    assert y2026["service"] == pytest.approx({**ZERO, "multilateral": 10})


def test_imf_service_is_refinanced_by_multilateral_and_bilateral_split_with_china():
    inputs = base_inputs(
        contracted={"2025": {**ZERO, "imf": 6, "china": 4}, "2026": ZERO},
        net_flows={"2019": {**ZERO, "bilateral": 30, "china": 10}},
        primary_balance={"2025": 0, "2026": 0},
    )
    y2025, y2026 = project_service(inputs, base_year=2024, end_year=2026)
    assert y2025["borrowing"] == pytest.approx({"multilateral": 6, "bilateral": 4, "private": 0})
    # Official terms: 3% for 2 years, half repaid in 2026.
    assert y2026["new"]["imf"] == 0
    assert y2026["new"]["multilateral"] == pytest.approx(6 * 0.03 + 3)
    assert y2026["new"]["bilateral"] == pytest.approx((4 * 0.03 + 2) * 0.75)
    assert y2026["new"]["china"] == pytest.approx((4 * 0.03 + 2) * 0.25)


def test_ida_keeps_official_reference_rate():
    y2026 = project_service(base_inputs(ida=True), base_year=2024, end_year=2026)[1]
    # Multilateral at 1% instead of 3%: 14 x 1% + 7.
    assert y2026["new"]["multilateral"] == pytest.approx(7.14)
    assert y2026["new"]["private"] == pytest.approx(4.32)


def test_missing_input_names_field_and_year():
    inputs = base_inputs(primary_balance={"2025": -2})
    with pytest.raises(ValueError, match=r"primary_balance.*2026"):
        project_service(inputs, base_year=2024, end_year=2026)
