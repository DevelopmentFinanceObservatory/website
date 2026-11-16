from datetime import date

import pytest

from pipeline.config import views
from pipeline.countries import ISO3
from pipeline.panel import Panel, amount_of, cross_check, merge_panels, span, whole

VIEW = views(date(2026, 1, 1), current_ids="November 2026")[1]


def empty() -> Panel:
    return {iso3: {} for iso3 in ISO3}


def test_merge_primary_wins_and_fill_supplies_gaps():
    primary = {"KEN": {"ppg_stock": {2024: 1.0}}}
    fill = {"KEN": {"ppg_stock": {2023: 5.0, 2024: 9.0}, "gdp": {2024: 3.0}}}
    merged = merge_panels(primary, fill)
    assert merged["KEN"] == {"ppg_stock": {2023: 5.0, 2024: 1.0}, "gdp": {2024: 3.0}}
    assert set(merged) == set(ISO3)
    assert fill["KEN"]["ppg_stock"][2024] == 9.0  # inputs are not mutated


def test_cross_check_counts_values_beyond_tolerance():
    dfo, bulk = empty(), empty()
    dfo["KEN"] = {"ppg_service": {2024: 100.0, 2025: 100.5, 2026: 50.0, 2040: 1.0}}
    bulk["KEN"] = {"ppg_service": {2024: 100.5, 2025: 100.0, 2026: 100.0, 2040: 9.0}}
    result = cross_check(dfo, bulk, VIEW)
    # 2024 and 2025 are within 1%; 2026 differs; 2040 is past the view's end.
    assert result["compared"] == 3
    assert result["differ"] == 1
    assert result["examples"] == ["KEN ppg_service 2026: DFO 50, bulk 100"]


def test_amount_of_reads_missing_and_none_as_zero():
    keys = {"a": {2020: 4.0}, "b": {2020: 0.0}}
    assert amount_of(keys, "a", 2020) == 4.0
    assert amount_of(keys, "a", 2021) == 0.0
    assert amount_of(keys, "missing", 2020) == 0.0


def test_span_includes_both_ends():
    assert list(span(2020, 2022)) == [2020, 2021, 2022]


@pytest.mark.parametrize(("amount", "expected"), [(None, None), (2.5, 2), (3.5, 4), (-0.4, 0)])
def test_whole_rounds_half_to_even(amount, expected):
    assert whole(amount) == expected
