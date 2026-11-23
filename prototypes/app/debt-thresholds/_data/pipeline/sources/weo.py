"""IMF World Economic Outlook series for the 58 countries."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Iterable, Mapping
from pathlib import Path

from pipeline.config import View
from pipeline.countries import ISO3
from pipeline.errors import DataError
from pipeline.panel import Series
from pipeline.provenance import Ledger

WEO_SERIES = {
    "gdp_usd_bn": "NGDPD",
    "revenue_pct": "GGR_NGDP",
    "primary_balance_pct": "GGXONLB_NGDP",
    "gg_debt_pct": "GGXWDG_NGDP",
}
WEO_NAMES = {
    "NGDPD": "Gross domestic product (GDP), Current prices, US dollar",
    "GGR_NGDP": "Revenue, General government, Percent of GDP",
    "GGXONLB_NGDP": (
        "Primary net lending (+) / net borrowing (-), General government, Percent of GDP"
    ),
    "GGXWDG_NGDP": "Gross debt, General government, Percent of GDP",
}


def load_weo(view: View, *, ledger: Ledger) -> dict[str, dict[str, Series]]:
    """Return one WEO release's series, by ISO3 then key; series codes confirmed by name."""
    # Imported here so the parsing helpers load without bblocks installed.
    from bblocks.data_importers import WEO

    frame = WEO().get_data(version=view.weo)
    frame = frame[frame["indicator_code"].isin(WEO_SERIES.values())]
    check_weo_names(
        {
            code: set(frame.loc[frame["indicator_code"] == code, "indicator_name"].dropna())
            for code in WEO_NAMES
        },
        view,
    )
    frame = frame[frame["entity_code"].isin(ISO3) & frame["value"].notna()]
    out = weo_panel(
        frame[["entity_code", "indicator_code", "year", "value"]].itertuples(index=False)
    )
    release = f"{view.weo[0]} {view.weo[1]}"
    ledger.preload(
        {
            "name": f"IMF World Economic Outlook, {release}",
            "baseYear": view.base,
            "vintage": release,
            "series": list(WEO_SERIES.values()),
            "source": (
                "https://www.imf.org/en/Publications/WEO, read with "
                "bblocks-data-importers 0.5.0 and imf-reader 2.3.0"
            ),
        }
    )
    return out


def check_weo_names(names: Mapping[str, set[str]], view: View) -> None:
    """Raise `DataError` when a series code carries a name other than the expected one.

    `names` maps each code in `WEO_NAMES` to the indicator names the release gives it.
    """
    for code, label in WEO_NAMES.items():
        found = names.get(code, set())
        if label not in found:
            raise DataError(f"WEO {view.weo} {code} is named {found}, expected {label!r}.")


def weo_panel(rows: Iterable[tuple[str, str, int, float]]) -> dict[str, dict[str, Series]]:
    """Return the panel for (iso3, series code, year, value) rows of countries in the note.

    Codes outside `WEO_SERIES` are dropped. Keys come in `WEO_SERIES` order.
    """
    rows = list(rows)
    out: dict[str, dict[str, Series]] = {iso3: defaultdict(dict) for iso3 in ISO3}
    for key, code in WEO_SERIES.items():
        for iso3, row_code, year, amount in rows:
            if row_code == code:
                out[iso3][key][int(year)] = float(amount)
    return out


def read_weo_file(path: Path, view: View) -> dict[str, dict[str, Series]]:
    """Return the WEO series a data step committed to `path`, by ISO3 then key, years as ints.

    A series the release lacks for a country reads as empty, as in `weo_panel`.
    Raises `DataError` when the file is missing, was read from another WEO
    release or base year than `view`'s, lacks a country in the note, or holds no
    country's value of a series in a year from `view.base` to `view.end`.
    """
    if not path.exists():
        raise DataError(f"{path.name} is missing; run the data step.")
    envelope = json.loads(path.read_text())
    release = f"{view.weo[0]} {view.weo[1]}"
    read = [
        (preload.get("vintage"), preload.get("baseYear"))
        for preload in envelope["provenance"].get("preloads", [])
        if preload.get("series") == list(WEO_SERIES.values())
    ]
    if read != [(release, view.base)]:
        raise DataError(
            f"{path.name} holds WEO {read or 'of no stated release'}, where the "
            f"{view.base} view reads the {release} release; run the data step."
        )
    data = envelope["data"]
    lacking = [iso3 for iso3 in ISO3 if iso3 not in data]
    if lacking:
        raise DataError(f"{path.name} lacks {', '.join(lacking)}; run the data step.")
    panel = {
        iso3: {
            key: {int(year): float(value) for year, value in data[iso3].get(key, {}).items()}
            for key in WEO_SERIES
        }
        for iso3 in ISO3
    }
    for key in WEO_SERIES:
        held = {year for series in panel.values() for year in series[key]}
        short = [year for year in range(view.base, view.end + 1) if year not in held]
        if short:
            raise DataError(
                f"{path.name} has no {key} value in {', '.join(map(str, short))}, which the "
                f"{view.base} view needs; run the data step."
            )
    return panel
