"""Net transfers on external debt by FDL group, as written to transfers.json.

The DFO read happens in `pipeline.sources.transfers`. This module takes the rows
it returns and the rows of groups.csv, and builds the file's data and provenance.
Group totals sum the countries that report a value in that year; `reporting`
counts them, so a gap in the data shows in the file.
"""

import csv
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime
from typing import TypedDict

from pipeline.errors import DataError

QUERY = "Net transfers on external debt for Kenya"
STAT_VAR = "dcid:Amount_FinancialFlow_Net_Disbursement_ServicingPayment_Nominal"
INDICATOR = "DT.NTR.DECT.CD"
FIRST_YEAR = 2010

TRANSFER_GROUPS = {
    "lower-risk": "Lower risk",
    "illiquid-issuer": "Illiquid, 2024/25 market issuer",
    "illiquid-no-issuer": "Illiquid, no 2024/25 market issuance",
    "insolvent": "Insolvent",
    "not-in-dsa": "Not covered in DSA",
}

type Values = dict[str, dict[int, float]]  # ISO3 -> year -> value


class Country(TypedDict):
    iso3: str
    name: str
    group: str
    values: list[float | None]


def parse_groups(lines: Iterable[str]) -> list[dict[str, str]]:
    """Return the rows of groups.csv from its lines, skipping the `#` source comment."""
    rows = list(csv.DictReader(line for line in lines if not line.startswith("#")))
    unknown = {row["group"] for row in rows} - TRANSFER_GROUPS.keys()
    if unknown:
        raise DataError(f"groups.csv names unknown groups: {sorted(unknown)}")
    return rows


def check_stat_vars(rows: Sequence[Mapping[str, object]]) -> None:
    """Raise `DataError` unless every fetched row is the net-transfers measure."""
    stat_vars = {row["stat_var"] for row in rows}
    if stat_vars != {STAT_VAR}:
        raise DataError(f"Search read another measure: {stat_vars}")


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
    """Return the latest year that at least half the countries report.

    The latest year counts as actual once most countries report it.
    """
    counts: defaultdict[int, int] = defaultdict(int)
    for series in values.values():
        for year in series:
            counts[year] += 1
    return max(year for year, n in counts.items() if n >= len(values) / 2)


def build_transfers(
    rows: Sequence[Mapping[str, object]],
    members: Sequence[Mapping[str, str]],
    *,
    release: str,
) -> dict:
    """Return the data of transfers.json from fetched `rows` and the groups.csv `members`.

    `release` names the IDS release; it sits in the data too, so the chart's
    source line can name it.
    """
    check_stat_vars(rows)
    values = values_by_country(rows)
    years = list(range(FIRST_YEAR, last_actual_year(values) + 1))

    countries: list[Country] = [
        {
            "iso3": row["iso3"],
            "name": row["name"],
            "group": row["group"],
            "values": [values.get(row["iso3"], {}).get(year) for year in years],
        }
        for row in members
    ]

    groups = []
    for key, label in TRANSFER_GROUPS.items():
        inside = [c for c in countries if c["group"] == key]
        totals: list[float | None] = []
        reporting: list[int] = []
        for i in range(len(years)):
            present = [v for c in inside if (v := c["values"][i]) is not None]
            totals.append(round(sum(present), 1) if present else None)
            reporting.append(len(present))
        groups.append(
            {
                "group": key,
                "label": label,
                "members": len(inside),
                "values": totals,
                "reporting": reporting,
            }
        )
    return {"release": release, "years": years, "groups": groups, "countries": countries}


def transfers_provenance(
    *,
    sdk_version: str,
    retrieved: datetime,
    release: str,
    sentence: str,
    citation: str,
    version: str,
) -> dict:
    """Return the provenance block of transfers.json.

    `retrieved` is a timezone-aware time, written in UTC with millisecond precision.
    """
    stamp = retrieved.astimezone(UTC).isoformat(timespec="milliseconds")
    return {
        "sdk": f"development-finance=={sdk_version}",
        "query": QUERY,
        "retrieved": stamp.replace("+00:00", "Z"),
        "ids": release,
        "indicator": INDICATOR,
        "sentence": sentence,
        "citation": citation,
        "version": version,
    }


def countries_without_values(countries: Sequence[Country]) -> list[str]:
    """Return the ISO3 codes, sorted, of countries with no value in any year."""
    return sorted(c["iso3"] for c in countries if all(v is None for v in c["values"]))
