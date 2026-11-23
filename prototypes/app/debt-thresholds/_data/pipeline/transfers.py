"""Net transfers on external debt: the series the page builds from the transfers ref.

The page's build reads the net-transfers rows from the `transfers` ref in
refs.json, at DFO's newest stored version, and builds each country's series with
ports of `values_by_country`, `last_actual_year` and `transfers_by_country`,
taking the 75 countries and their FDL groups from groups.csv. `parity_fixture`
writes real rows and this module's output for them, which the page's port is
tested against.
"""

import csv
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from typing import TypedDict

from pipeline.errors import DataError

INDICATOR = "DT.NTR.DECT.CD"
FIRST_YEAR = 2010
# The read's years. A ref keeps its window, so a release past 2031 takes a new search.
WINDOW = (FIRST_YEAR, 2031)
# Countries whose rows the parity fixture keeps, with every year the read holds. The
# read has no rows for South Sudan, so its series is all null.
FIXTURE_ISO3 = ("BTN", "KEN", "IND", "SOM", "ZWE", "LBN", "SSD")

TRANSFER_GROUPS = {
    "lower-risk": "Lower risk",
    "illiquid-issuer": "Illiquid, 2024/25 market issuer",
    "illiquid-no-issuer": "Illiquid, no 2024/25 market issuance",
    "insolvent": "Insolvent",
    "not-in-dsa": "Not covered in DSA",
}

type Values = dict[str, dict[int, float]]  # ISO3 -> year -> value


class Member(TypedDict):
    iso3: str
    name: str
    group: str


class Country(Member):
    values: list[float | None]


def parse_groups(lines: Iterable[str]) -> list[Member]:
    """Return the rows of groups.csv from its lines, skipping the `#` source comment."""
    rows = [
        Member(iso3=row["iso3"], name=row["name"], group=row["group"])
        for row in csv.DictReader(line for line in lines if not line.startswith("#"))
    ]
    unknown = {row["group"] for row in rows} - TRANSFER_GROUPS.keys()
    if unknown:
        raise DataError(f"groups.csv names unknown groups: {sorted(unknown)}")
    return rows


def values_by_country(rows: Sequence[Mapping[str, object]]) -> Values:
    """Return each country's value by year from `FIRST_YEAR` on, skipping empty values.

    The result is a `defaultdict`, so a country without values reads as empty.
    """
    values: Values = defaultdict(dict)
    for row in rows:
        year = int(str(row["time_period"]))
        value = row["value"]
        if year >= FIRST_YEAR and value is not None:
            iso3 = str(row["financingRecipient"]).removeprefix("country/")
            values[iso3][year] = float(str(value))
    if not values:
        raise DataError("The fetch returned no values from 2010 on.")
    return values


def last_actual_year(values: Values) -> int:
    """Return the latest year that at least half the countries with any value report.

    The latest year counts as actual once most countries report it.
    """
    counts: defaultdict[int, int] = defaultdict(int)
    for series in values.values():
        for year in series:
            counts[year] += 1
    return max(year for year, n in counts.items() if n >= len(values) / 2)


def transfers_by_country(
    rows: Sequence[Mapping[str, object]], members: Sequence[Member]
) -> tuple[list[int], list[Country]]:
    """Return the years from `FIRST_YEAR` to the last actual one, and each member's values.

    A member's value is null in a year it does not report. This is the series the
    page draws.
    """
    values = values_by_country(rows)
    years = list(range(FIRST_YEAR, last_actual_year(values) + 1))
    countries = [
        Country(
            iso3=member["iso3"],
            name=member["name"],
            group=member["group"],
            values=[values.get(member["iso3"], {}).get(year) for year in years],
        )
        for member in members
    ]
    return years, countries


def parity_fixture(rows: Sequence[Mapping[str, object]], members: Sequence[Member]) -> dict:
    """Return real rows of `FIXTURE_ISO3` and this module's output for them.

    Each row keeps the three columns the functions read. `expected` holds
    `values_by_country` (years as keys), `last_actual_year` and
    `transfers_by_country` for the fixture's members.
    """
    kept = [
        {
            "financingRecipient": row["financingRecipient"],
            "time_period": row["time_period"],
            "value": row["value"],
        }
        for row in rows
        if str(row["financingRecipient"]).removeprefix("country/") in FIXTURE_ISO3
    ]
    kept.sort(key=lambda row: (str(row["financingRecipient"]), int(str(row["time_period"]))))
    chosen = [member for member in members if member["iso3"] in FIXTURE_ISO3]
    values = values_by_country(kept)
    years, countries = transfers_by_country(kept, chosen)
    return {
        "rows": kept,
        "members": chosen,
        "expected": {
            "valuesByCountry": {
                iso3: {str(year): value for year, value in sorted(series.items())}
                for iso3, series in sorted(values.items())
            },
            "lastActualYear": last_actual_year(values),
            "years": years,
            "countries": countries,
        },
    }


def countries_without_values(countries: Sequence[Country]) -> list[str]:
    """Return the ISO3 codes, sorted, of countries with no value in any year."""
    return sorted(c["iso3"] for c in countries if all(v is None for v in c["values"]))
