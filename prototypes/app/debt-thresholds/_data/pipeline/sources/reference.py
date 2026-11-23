"""Reference data: the US Treasury rate, World Bank lending categories and capacity.csv."""

from __future__ import annotations

import csv
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pipeline.config import REFERENCE_YEARS, View
from pipeline.countries import COUNTRIES, ISO3
from pipeline.errors import DataError
from pipeline.panel import Series
from pipeline.provenance import Ledger
from pipeline.sources.pinned import Mode

if TYPE_CHECKING:
    import httpx

# US 10-year Treasury constant-maturity yield, monthly averages, annualised here.
# FDL's US rate reverts to "3% nominal (1% real + 2% inflation)", a long rate.
US_RATE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS10"
WB_COUNTRIES_URL = "https://api.worldbank.org/v2/country?format=json&per_page=400"

# One view's reference reads: `read` (ISO date), `usRate` (year -> percent or
# null) and `ida` (ISO3 -> IDA-eligible).
type Snapshot = dict[str, Any]


def read_reference(view: View, *, client: httpx.Client, today: date) -> Snapshot:
    """Return the US rate and IDA status one view uses, as read today.

    The snapshot keeps the US rate for the reference years and the base year, and
    goes into reference.json, so a later run builds the view on the same values.
    """
    response = client.get(US_RATE_URL, timeout=120.0, follow_redirects=True)
    rate = parse_us_rate(response.raise_for_status().text)
    response = client.get(WB_COUNTRIES_URL, timeout=120.0)
    ida = parse_ida(response.raise_for_status().json())
    return {
        "read": today.isoformat(),
        "usRate": {str(year): rate.get(year) for year in [*REFERENCE_YEARS, view.base]},
        "ida": ida,
    }


def view_snapshots(
    both: Sequence[View],
    committed: Mapping[str, Snapshot],
    *,
    mode: Mode,
    client: httpx.Client,
    today: date,
) -> dict[str, Snapshot]:
    """Return the US rate and IDA status of each view, by base year.

    A plain run takes the committed values. Otherwise the archived view keeps its
    committed values, so a refresh leaves it as it was, and the current view
    reads them again.
    """
    snapshots: dict[str, Snapshot] = {}
    for view in both:
        base = str(view.base)
        if base in committed and (mode is Mode.PLAIN or view.archived):
            snapshots[base] = committed[base]
        elif mode is Mode.PLAIN:
            raise DataError(f"reference.json has no {base} view; run with --refresh.")
        else:
            snapshots[base] = read_reference(view, client=client, today=today)
    return snapshots


def snapshot_values(snapshot: Snapshot) -> tuple[Series, dict[str, bool]]:
    """Return a snapshot's US rate by year and IDA status by ISO3, as `build_view` takes them."""
    rate = {int(year): value for year, value in snapshot["usRate"].items() if value is not None}
    return rate, dict(snapshot["ida"])


def record_reference(ledger: Ledger, view: View, snapshot: Snapshot) -> None:
    """Record the US rate and IDA status a view was built on, with the day they were read."""
    vintage = f"read {snapshot['read']}"
    ledger.preload(
        {
            "name": (
                "US 10-year Treasury constant-maturity yield (FRED GS10), "
                "annual average of monthly values"
            ),
            "baseYear": view.base,
            "vintage": vintage,
            "source": US_RATE_URL,
        }
    )
    ledger.preload(
        {
            "name": "World Bank lending category (IDA, blend, IBRD)",
            "baseYear": view.base,
            "vintage": vintage,
            "source": WB_COUNTRIES_URL,
        }
    )


def parse_us_rate(text: str) -> Series:
    """Return the yearly mean of the monthly values in FRED CSV text, for years with 12 months."""
    months: dict[int, list[float]] = defaultdict(list)
    for row in list(csv.reader(text.splitlines()))[1:]:
        if row[1] not in ("", "."):
            months[int(row[0][:4])].append(float(row[1]))
    return {year: sum(v) / len(v) for year, v in months.items() if len(v) == 12}


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
