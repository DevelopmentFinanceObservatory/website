import pytest

from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.panel import amount_of, check_actuals, span, whole


@pytest.mark.parametrize(
    ("stocks", "ok"),
    [
        ({2025: 1.0}, True),  # actuals end in the base year
        ({2025: 1.0, 2026: 1.0}, False),  # a later actual: a newer release
        ({2024: 1.0}, False),  # no base-year stock: an older release
    ],
)
def test_check_actuals_needs_a_release_ending_in_the_base_year(stocks, ok):
    panel = {iso3: {"ppg_stock": dict(stocks)} for iso3 in ISO3}
    if ok:
        check_actuals(panel, 2025, source="the test release")
    else:
        with pytest.raises(DataError, match="the test release does not end its actuals in 2025"):
            check_actuals(panel, 2025, source="the test release")


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
