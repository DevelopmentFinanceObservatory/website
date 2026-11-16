"""The coverage report: which series each country has in each base year.

`coverage.md` lists the 58 countries by series for both base years, then the
creditor-group guard and the lending-terms fallback. The run fails when more than
`MAX_MISSING` countries lack a core series (debt stock, debt service, GDP,
revenue) in the default year.
"""

from collections.abc import Mapping, Sequence
from datetime import date

from pipeline.config import CORE, MAX_MISSING, View
from pipeline.countries import COUNTRIES


def coverage_rows(built: Mapping[str, dict], view: View) -> list[dict]:
    """Return one row per country: which series the base year has."""
    rows = []
    for country in COUNTRIES:
        base = built[country.iso3]
        base_row = next(r for r in base["years"] if r["year"] == view.base)
        cells = {
            "debt stock": base["debtPV"] is not None,
            "debt service": base_row["service"] is not None,
            "GDP": base["gdp"] is not None,
            "revenue": base_row["revenue"] is not None,
            "projection": all(r["service"] is not None for r in base["years"] if r["projected"]),
            "capacity": base["capacity"] is not None,
        }
        missing = [series for series in CORE if not cells[series]]
        rows.append(
            {"iso3": country.iso3, "name": country.name, "cells": cells, "missing": missing}
        )
    return rows


def render_coverage(
    coverage: Mapping[int, list[dict]],
    missing: Mapping[int, list[str]],
    *,
    checks: Mapping[int, dict],
    default_year: int,
    notes: Sequence[str],
    views: Sequence[View],
    today: date,
) -> str:
    """Return the text of coverage.md.

    `coverage` holds the `coverage_rows` of each base year, `missing` the countries
    lacking a core series, and `checks` the guard, cross-check and terms-fallback
    results. `today` stamps the report.
    """
    lines = [
        "# Coverage of the debt-thresholds data",
        "",
        (
            f"Written by `fetch.py` on {today.isoformat()}. Core series are debt "
            "stock, debt service, GDP and revenue in the base year. The step fails when "
            f"more than {MAX_MISSING} countries lack one in the default year, "
            f"{default_year}."
        ),
        "",
    ]
    for view in views:
        rows, check = coverage[view.base], checks[view.base]
        source = "DFO API" if view.use_dfo else "archived bulk files"
        lines += [
            f"## Base year {view.base}",
            "",
            (
                f"IDS {view.ids} ({source}), WEO {view.weo[0]} {view.weo[1]}, "
                f"projected to {view.end}."
            ),
            "",
            listed("Countries lacking a core series", missing[view.base]),
            listed(
                "Countries without a projection",
                [r["iso3"] for r in rows if not r["cells"]["projection"]],
            ),
            listed(
                "Countries without a capacity",
                [r["iso3"] for r in rows if not r["cells"]["capacity"]],
            ),
        ]
        guard = check["guard"]
        lines.append(
            f"- Creditor-group guard, 1%: {guard['checked'] - guard['failed']} of "
            f"{guard['checked']} country-years pass"
        )
        lines += [f"  - {failure}" for failure in guard["failures"][:20]]
        if guard["failed"] > 20:
            lines.append(f"  - and {guard['failed'] - 20} more")
        if check["terms_fallback"]:
            lines.append(
                "- No 2015-19 commitments from a source, so the 58-country average "
                "terms stand in: " + ", ".join(check["terms_fallback"])
            )
        lines += [
            "",
            "| Country | ISO3 | Debt stock | Debt service | GDP | Revenue "
            "| Projection | Capacity |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for row in rows:
            marks = " | ".join("yes" if ok else "**no**" for ok in row["cells"].values())
            lines.append(f"| {row['name']} | {row['iso3']} | {marks} |")
        lines.append("")
    if notes:
        lines += ["## Notes", "", *[f"- {note}" for note in notes], ""]
    return "\n".join(lines)


def listed(label: str, codes: Sequence[str]) -> str:
    """Return a report bullet naming `label`, the count of `codes` and the codes."""
    return f"- {label}: {len(codes)}" + (f" ({', '.join(codes)})" if codes else "")
