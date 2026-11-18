"""Tests for the transfers grouping and sums."""

from datetime import UTC, datetime

import pytest

from pipeline.errors import DataError
from pipeline.transfers import (
    FIRST_YEAR,
    INDICATOR,
    STAT_VAR,
    build_transfers,
    countries_without_values,
    parse_groups,
    transfers_provenance,
    values_by_country,
)

MEMBERS = [
    {"iso3": "AAA", "name": "Alpha", "group": "lower-risk"},
    {"iso3": "BBB", "name": "Beta", "group": "lower-risk"},
    {"iso3": "CCC", "name": "Gamma", "group": "insolvent"},
    {"iso3": "DDD", "name": "Delta", "group": "insolvent"},
]


def row(iso3: str, year: int, value: float | None, stat_var: str = STAT_VAR) -> dict:
    return {
        "stat_var": stat_var,
        "time_period": str(year),
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


def test_build_transfers_sums_and_counts_reporting() -> None:
    data = build_transfers(ROWS, MEMBERS, release="November 2026")
    assert list(data) == ["release", "years", "groups", "countries"]
    assert data["years"] == [2010, 2011]
    by_group = {g["group"]: g for g in data["groups"]}
    assert by_group["lower-risk"]["values"] == [15.1, 1.0]
    assert by_group["lower-risk"]["reporting"] == [2, 1]
    assert by_group["lower-risk"]["members"] == 2
    assert by_group["insolvent"]["values"] == [-3.0, -4.0]
    assert by_group["insolvent"]["reporting"] == [1, 1]
    assert by_group["not-in-dsa"]["values"] == [None, None]
    assert by_group["not-in-dsa"]["members"] == 0
    assert list(by_group) == [
        "lower-risk",
        "illiquid-issuer",
        "illiquid-no-issuer",
        "insolvent",
        "not-in-dsa",
    ]
    delta = data["countries"][3]
    assert delta["values"] == [None, None]
    assert countries_without_values(data["countries"]) == ["DDD"]


def test_build_transfers_rejects_another_measure() -> None:
    with pytest.raises(DataError, match="another measure"):
        build_transfers([row("AAA", 2010, 1.0, stat_var="x")], MEMBERS, release="r")


def test_build_transfers_rejects_empty_fetch() -> None:
    with pytest.raises(DataError, match="no values"):
        build_transfers([row("AAA", 2005, 1.0)], MEMBERS, release="r")


def test_parse_groups_skips_comments_and_rejects_unknown() -> None:
    rows = parse_groups(["# source\n", "iso3,name,group\n", "AAA,Alpha,lower-risk\n"])
    assert rows == [{"iso3": "AAA", "name": "Alpha", "group": "lower-risk"}]
    with pytest.raises(DataError, match="unknown groups"):
        parse_groups(["iso3,name,group\n", "AAA,Alpha,nope\n"])


def test_transfers_provenance_key_order_and_stamp() -> None:
    provenance = transfers_provenance(
        sdk_version="0.2.0",
        retrieved=datetime(2026, 11, 16, 18, 24, 49, 132000, tzinfo=UTC),
        release="November 2026",
        sentence="s",
        citation="c",
        version="cv_1",
    )
    assert list(provenance) == [
        "sdk",
        "query",
        "retrieved",
        "ids",
        "indicator",
        "sentence",
        "citation",
        "version",
    ]
    assert provenance["retrieved"] == "2026-11-16T18:24:49.132Z"
    assert provenance["indicator"] == INDICATOR
    assert provenance["sdk"] == "development-finance==0.2.0"


def test_values_by_country_reads_a_missing_country_as_empty() -> None:
    values = values_by_country([row("AAA", FIRST_YEAR - 1, 1.0), row("AAA", FIRST_YEAR, 2)])
    assert values == {"AAA": {FIRST_YEAR: 2.0}}
    assert values["ZZZ"] == {}
