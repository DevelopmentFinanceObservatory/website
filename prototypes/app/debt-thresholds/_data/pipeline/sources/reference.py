"""Reference data: the US Treasury rate, World Bank lending categories and capacity.csv."""

from __future__ import annotations

import csv
from collections import defaultdict
from collections.abc import Mapping
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

from pipeline.countries import COUNTRIES, ISO3
from pipeline.errors import DataError
from pipeline.panel import Series
from pipeline.provenance import Ledger

if TYPE_CHECKING:
    import httpx

# US 10-year Treasury constant-maturity yield, monthly averages, annualised here.
# FDL's US rate reverts to "3% nominal (1% real + 2% inflation)", a long rate.
US_RATE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS10"
WB_COUNTRIES_URL = "https://api.worldbank.org/v2/country?format=json&per_page=400"


def load_us_rate(*, client: httpx.Client, ledger: Ledger, today: date) -> Series:
    """Return the annual average of the US 10-year Treasury yield, complete years only."""
    response = client.get(US_RATE_URL, timeout=120.0, follow_redirects=True)
    rate = parse_us_rate(response.raise_for_status().text)
    ledger.preload(
        {
            "name": (
                "US 10-year Treasury constant-maturity yield (FRED GS10), "
                "annual average of monthly values"
            ),
            "vintage": f"read {today.isoformat()}",
            "source": US_RATE_URL,
        }
    )
    return rate


def parse_us_rate(text: str) -> Series:
    """Return the yearly mean of the monthly values in FRED CSV text, for years with 12 months."""
    months: dict[int, list[float]] = defaultdict(list)
    for row in list(csv.reader(text.splitlines()))[1:]:
        if row[1] not in ("", "."):
            months[int(row[0][:4])].append(float(row[1]))
    return {year: sum(v) / len(v) for year, v in months.items() if len(v) == 12}


def load_ida(*, client: httpx.Client, ledger: Ledger, today: date) -> dict[str, bool]:
    """Return whether each country is IDA-eligible (IDA-only or blend), by ISO3."""
    response = client.get(WB_COUNTRIES_URL, timeout=120.0)
    ida = parse_ida(response.raise_for_status().json())
    ledger.preload(
        {
            "name": (
                "World Bank lending category (IDA, blend, IBRD), current "
                "classification, used for both base years"
            ),
            "vintage": f"read {today.isoformat()}",
            "source": WB_COUNTRIES_URL,
        }
    )
    return ida


def parse_ida(payload: list) -> dict[str, bool]:
    """Return IDA eligibility by ISO3 from the World Bank country list response.

    Raises `DataError` when a country in the note has no lending category.
    """
    lending = {c["id"]: c["lendingType"]["id"] for c in payload[1]}
    unknown = [iso3 for iso3 in ISO3 if iso3 not in lending]
    if unknown:
        raise DataError(f"no World Bank lending category for {', '.join(unknown)}.")
    return {iso3: lending[iso3] in ("IDX", "IDB") for iso3 in ISO3}


def load_capacity(path: Path, *, ledger: Ledger) -> dict[str, dict[str, str]]:
    """Return the rows of capacity.csv by ISO3; empty when the file is not there yet."""
    if not path.exists():
        ledger.note("capacity.csv is missing, so every capacity is null.")
        return {}
    with path.open(newline="") as handle:
        rows = {row["iso3"]: row for row in csv.DictReader(handle)}
    for text in capacity_notes(rows):
        ledger.note(text)
    return rows


def capacity_notes(rows: Mapping[str, Mapping[str, str]]) -> list[str]:
    """Return the notes for gaps and mismatches in capacity.csv rows, in report order."""
    notes: list[str] = []
    for iso3, _, fdl in COUNTRIES:
        row = rows.get(iso3)
        if row is None:
            notes.append(f"capacity.csv has no row for {iso3}.")
        elif row.get("fdl2024") and row["fdl2024"] != fdl:
            notes.append(
                f"capacity.csv gives {iso3} the FDL group {row['fdl2024']}; FDL's annex says {fdl}."
            )
    if rows and "capacity_2024" not in next(iter(rows.values())):
        notes.append("capacity.csv has no capacity_2024 column, so 2024 uses current capacities.")
    if any(
        len(row.get(c) or "") == 7 for row in rows.values() for c in ("dsa_date", "dsa_date_2024")
    ):
        notes.append(
            "capacity.csv gives DSA dates as year and month; `dsaDate` puts them on "
            "the first of the month."
        )
    return notes
