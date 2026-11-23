"""Tests for the page's net-transfers series and the parity fixture."""

import pytest

from pipeline.errors import DataError
from pipeline.transfers import (
    FIRST_YEAR,
    FIXTURE_ISO3,
    countries_without_values,
    parity_fixture,
    parse_groups,
    transfers_by_country,
    values_by_country,
)

MEMBERS = [
    {"iso3": "AAA", "name": "Alpha", "group": "lower-risk"},
    {"iso3": "BBB", "name": "Beta", "group": "lower-risk"},
    {"iso3": "CCC", "name": "Gamma", "group": "insolvent"},
    {"iso3": "DDD", "name": "Delta", "group": "insolvent"},
]


def row(iso3: str, year: int, value: float | None) -> dict:
    return {
        "stat_var": "dcid:x",
        "time_period": year,
        "value": value,
        "financingRecipient": f"country/{iso3}",
    }


ROWS = [
    row("AAA", 2009, 99.0),  # before the first year
    row("AAA", 2010, 10.04),
    row("BBB", 2010, 5.04),
    row("AAA", 2011, 1.0),
    row("BBB", 2011, None),  # empty value is skipped
    row("CCC", 2010, -3.0),
    row("CCC", 2011, -4.0),
    row("AAA", 2012, 7.0),  # one of three reporting: below half, so not actual
]


def test_transfers_by_country_ends_at_the_last_year_half_report() -> None:
    years, countries = transfers_by_country(ROWS, MEMBERS)
    assert years == [2010, 2011]
    assert [c["values"] for c in countries] == [
        [10.04, 1.0],
        [5.04, None],
        [-3.0, -4.0],
        [None, None],
    ]
    assert countries[0] == {**MEMBERS[0], "values": [10.04, 1.0]}
    assert countries_without_values(countries) == ["DDD"]


def test_last_actual_year_counts_the_countries_with_values_not_the_members() -> None:
    # Three of six members have values; 2012 is reported by two of the three. Half of
    # the three is 1.5, so 2012 is actual; half of the six members would be 3.
    members = [{"iso3": iso3, "name": iso3, "group": "insolvent"} for iso3 in "ABCDEF"]
    rows = [
        *(row(iso3, year, 1.0) for iso3 in "AB" for year in (2010, 2011, 2012)),
        *(row("C", year, 1.0) for year in (2010, 2011)),
    ]
    years, _ = transfers_by_country(rows, members)
    assert years == [2010, 2011, 2012]


def test_transfers_by_country_rejects_an_empty_fetch() -> None:
    with pytest.raises(DataError, match="no values"):
        transfers_by_country([row("AAA", 2005, 1.0)], MEMBERS)


def test_parity_fixture_keeps_its_countries_rows_and_the_output_for_them() -> None:
    kept, other = FIXTURE_ISO3[0], "AAA"
    members = [{"iso3": kept, "name": "K", "group": "insolvent"}, *MEMBERS]
    rows = [row(kept, 2011, 2.0), row(kept, 2010, None), row(other, 2010, 1.0)]
    fixture = parity_fixture(rows, members)
    assert fixture["rows"] == [
        {"financingRecipient": f"country/{kept}", "time_period": 2010, "value": None},
        {"financingRecipient": f"country/{kept}", "time_period": 2011, "value": 2.0},
    ]
    assert fixture["members"] == members[:1]
    assert fixture["expected"] == {
        "valuesByCountry": {kept: {"2011": 2.0}},
        "lastActualYear": 2011,
        "years": [2010, 2011],
        "countries": [{"iso3": kept, "name": "K", "group": "insolvent", "values": [None, 2.0]}],
    }


def test_parse_groups_skips_comments_and_rejects_unknown() -> None:
    rows = parse_groups(["# source\n", "iso3,name,group\n", "AAA,Alpha,lower-risk\n"])
    assert rows == [{"iso3": "AAA", "name": "Alpha", "group": "lower-risk"}]
    with pytest.raises(DataError, match="unknown groups"):
        parse_groups(["iso3,name,group\n", "AAA,Alpha,nope\n"])


def test_values_by_country_reads_a_missing_country_as_empty() -> None:
    values = values_by_country([row("AAA", FIRST_YEAR - 1, 1.0), row("AAA", FIRST_YEAR, 2)])
    assert values == {"AAA": {FIRST_YEAR: 2.0}}
    assert values["ZZZ"] == {}
